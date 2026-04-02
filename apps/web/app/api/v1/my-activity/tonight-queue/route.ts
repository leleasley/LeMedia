import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash, getUserTasteProfile } from "@/db";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";
import { getContinueWatching } from "@/lib/jellyfin-watch";
import { discoverMovies, discoverTv, getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

type QueueItem = {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  reason: string;
  score: number;
  source: "continue" | "discover";
  progress?: number | null;
};

function genreIdFromTaste(taste: any): number | null {
  if (!taste) return null;
  const entries: Array<{ key: string; genreId: number }> = [
    { key: "genreScifi", genreId: 878 },
    { key: "genreAction", genreId: 28 },
    { key: "genreComedy", genreId: 35 },
    { key: "genreDrama", genreId: 18 },
    { key: "genreHorror", genreId: 27 },
    { key: "genreRomance", genreId: 10749 },
    { key: "genreThriller", genreId: 53 },
    { key: "genreFantasy", genreId: 14 },
    { key: "genreAnimation", genreId: 16 },
    { key: "genreDocumentary", genreId: 99 },
  ];

  let best: { genreId: number; value: number } | null = null;
  for (const entry of entries) {
    const value = Number(taste?.[entry.key] ?? 0);
    if (!Number.isFinite(value)) continue;
    if (!best || value > best.value) {
      best = { genreId: entry.genreId, value };
    }
  }
  if (!best || best.value < 2) return null;
  return best.genreId;
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser?.id) {
    return cacheableJsonResponseWithETag(req, { items: [] }, { maxAge: 60 });
  }

  const jellyfinUserId = dbUser.jellyfin_user_id;

  try {
    const imageProxyEnabled = await getImageProxyEnabled();
    const items: QueueItem[] = [];
    const seen = new Set<string>();

    if (jellyfinUserId) {
      const continueWatching = await getContinueWatching(jellyfinUserId).catch(() => []);
      for (const item of continueWatching.slice(0, 4)) {
        const rawTmdb = item?.ProviderIds?.Tmdb;
        const tmdbId = rawTmdb ? Number.parseInt(String(rawTmdb), 10) : Number.NaN;
        if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;

        const mediaType = item.Type === "Movie" ? "movie" : "tv";
        const key = `${mediaType}:${tmdbId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let title = String(item.Name ?? "Continue watching");
        let posterPath: string | null = null;
        try {
          if (mediaType === "movie") {
            const movie = await getMovie(tmdbId);
            title = String(movie?.title ?? title);
            posterPath = tmdbImageUrl(movie?.poster_path, "w342", imageProxyEnabled);
          } else {
            const tv = await getTv(tmdbId);
            title = String(tv?.name ?? title);
            posterPath = tmdbImageUrl(tv?.poster_path, "w342", imageProxyEnabled);
          }
        } catch {
          // Fall back to Jellyfin title if TMDB lookup fails.
        }

        const progress = Number(item?.UserData?.PlayedPercentage ?? 0);
        items.push({
          id: `continue-${mediaType}-${tmdbId}`,
          mediaType,
          tmdbId,
          title,
          posterPath,
          reason: "Continue where you left off",
          score: 100 - Math.min(Math.max(progress, 0), 100) / 2,
          source: "continue",
          progress,
        });
      }
    }

    const taste = await getUserTasteProfile(dbUser.id).catch(() => null);
    const topGenreId = genreIdFromTaste(taste);
    const minRating = Math.max(5.5, Number(taste?.minRating ?? 6.5));
    const discoveryParams: Record<string, string | number> = {
      sort_by: "popularity.desc",
      "vote_average.gte": minRating,
      "vote_count.gte": 120,
    };
    if (topGenreId) discoveryParams.with_genres = topGenreId;

    const [movieDiscover, tvDiscover] = await Promise.all([
      discoverMovies(discoveryParams, 1).catch(() => ({ results: [] })),
      discoverTv(discoveryParams, 1).catch(() => ({ results: [] })),
    ]);

    const addDiscovery = (
      mediaType: "movie" | "tv",
      entry: any,
      scoreBase: number,
      reason: string
    ) => {
      const tmdbId = Number(entry?.id ?? 0);
      if (!tmdbId) return;
      const key = `${mediaType}:${tmdbId}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({
        id: `discover-${mediaType}-${tmdbId}`,
        mediaType,
        tmdbId,
        title: mediaType === "movie" ? String(entry?.title ?? "Untitled") : String(entry?.name ?? "Untitled"),
        posterPath: tmdbImageUrl(entry?.poster_path ?? null, "w342", imageProxyEnabled),
        reason,
        score: scoreBase + Math.min(Number(entry?.vote_average ?? 0), 10),
        source: "discover",
      });
    };

    for (const entry of (movieDiscover as any)?.results?.slice(0, 6) ?? []) {
      addDiscovery("movie", entry, 70, "High-confidence match from your taste profile");
    }
    for (const entry of (tvDiscover as any)?.results?.slice(0, 6) ?? []) {
      addDiscovery("tv", entry, 68, "Personalized pick based on your recent watch patterns");
    }

    const sorted = items
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return cacheableJsonResponseWithETag(req, { items: sorted }, { maxAge: 300 });
  } catch (error) {
    logger.error("[Tonight Queue] Error", error);
    return cacheableJsonResponseWithETag(
      req,
      { items: [], error: "Failed to build tonight queue" },
      { maxAge: 30 }
    );
  }
}
