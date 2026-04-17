import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import { getTonightQueueLikedGenres, getTonightQueuePreferences, getTonightQueueSkippedSet, getUserTasteProfile, getUserWithHash } from "@/db";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { getAppTimezone, getIsoDateInTimeZone } from "@/lib/app-timezone";
import { logger } from "@/lib/logger";
import {
  createTonightQueueSeed,
  pickRotatingPages,
  scoreSeededDiscoveryCandidate,
} from "@/lib/tonight-queue";
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
  genreIds?: number[];
  progress?: number | null;
};

type QueuePreferencesPayload = {
  mood: "comfort" | "focused" | "wildcard";
  hideHorror: boolean;
};

function normalizeGenreIds(entry: any): number[] {
  if (Array.isArray(entry?.genre_ids)) {
    return entry.genre_ids
      .map((value: unknown) => Number(value))
      .filter((value: number) => Number.isFinite(value) && value > 0);
  }

  if (Array.isArray(entry?.genres)) {
    return entry.genres
      .map((genre: any) => Number(genre?.id))
      .filter((value: number) => Number.isFinite(value) && value > 0);
  }

  return [];
}

function isHorror(genreIds: number[]) {
  return genreIds.includes(27);
}

function applyMoodScore(baseScore: number, mood: QueuePreferencesPayload["mood"], source: QueueItem["source"], voteAverage?: number) {
  if (mood === "comfort") {
    return baseScore + (source === "continue" ? 12 : 4);
  }
  if (mood === "focused") {
    return baseScore + (voteAverage ?? 0) * 1.4 + (source === "continue" ? 4 : 0);
  }
  return baseScore + (source === "discover" ? 6 : 2);
}

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
    return jsonResponseWithETag(req, { items: [] });
  }

  const jellyfinUserId = dbUser.jellyfin_user_id;

  try {
    const imageProxyEnabled = await getImageProxyEnabled();
    const timeZone = await getAppTimezone();
    const isoDate = getIsoDateInTimeZone(Date.now(), timeZone);
    const [preferences, likedGenres, skippedSet] = await Promise.all([
      getTonightQueuePreferences(dbUser.id),
      getTonightQueueLikedGenres(dbUser.id),
      getTonightQueueSkippedSet(dbUser.id, isoDate),
    ]);
    const queueSeed = createTonightQueueSeed(dbUser.id + preferences.refreshSeed, isoDate);
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
        let genreIds: number[] = [];
        try {
          if (mediaType === "movie") {
            const movie = await getMovie(tmdbId);
            title = String(movie?.title ?? title);
            posterPath = tmdbImageUrl(movie?.poster_path, "w342", imageProxyEnabled);
            genreIds = normalizeGenreIds(movie);
          } else {
            const tv = await getTv(tmdbId);
            title = String(tv?.name ?? title);
            posterPath = tmdbImageUrl(tv?.poster_path, "w342", imageProxyEnabled);
            genreIds = normalizeGenreIds(tv);
          }
        } catch {
          // Fall back to Jellyfin title if TMDB lookup fails.
        }

        if (preferences.hideHorror && isHorror(genreIds)) continue;
        if (skippedSet.has(key)) continue;

        const progress = Number(item?.UserData?.PlayedPercentage ?? 0);
        items.push({
          id: `continue-${mediaType}-${tmdbId}`,
          mediaType,
          tmdbId,
          title,
          posterPath,
          reason: preferences.mood === "comfort" ? "Comfort pick from where you left off" : "Continue where you left off",
          score: applyMoodScore(100 - Math.min(Math.max(progress, 0), 100) / 2, preferences.mood, "continue"),
          source: "continue",
          genreIds,
          progress,
        });
      }
    }

    const taste = await getUserTasteProfile(dbUser.id).catch(() => null);
    const preferredGenreId = likedGenres[0] ?? genreIdFromTaste(taste);
    const topGenreId = preferences.hideHorror && preferredGenreId === 27 ? null : preferredGenreId;
    const minRating = Math.max(5.5, Number(taste?.minRating ?? 6.5));
    const discoveryParams: Record<string, string | number> = {
      sort_by: "popularity.desc",
      "vote_average.gte": minRating,
      "vote_count.gte": 120,
    };
    if (topGenreId) discoveryParams.with_genres = topGenreId;
    if (preferences.hideHorror) discoveryParams.without_genres = 27;

    const moviePages = pickRotatingPages(queueSeed, 5, 2);
    const tvPages = pickRotatingPages(queueSeed ^ 0x9e3779b9, 5, 2);

    const [movieDiscoverPages, tvDiscoverPages] = await Promise.all([
      Promise.all(moviePages.map((page) => discoverMovies(discoveryParams, page).catch(() => ({ results: [] })))),
      Promise.all(tvPages.map((page) => discoverTv(discoveryParams, page).catch(() => ({ results: [] })))),
    ]);

    const addDiscovery = (
      mediaType: "movie" | "tv",
      entry: any,
      scoreBase: number,
      reason: string,
      slot: number
    ) => {
      const tmdbId = Number(entry?.id ?? 0);
      if (!tmdbId) return;
      const key = `${mediaType}:${tmdbId}`;
      if (seen.has(key)) return;
      if (skippedSet.has(key)) return;
      const genreIds = normalizeGenreIds(entry);
      if (preferences.hideHorror && isHorror(genreIds)) return;
      seen.add(key);
      const overlapBoost = genreIds.some((genreId) => likedGenres.includes(genreId)) ? 8 : 0;
      const rating = Number(entry?.vote_average ?? 0);
      items.push({
        id: `discover-${mediaType}-${tmdbId}`,
        mediaType,
        tmdbId,
        title: mediaType === "movie" ? String(entry?.title ?? "Untitled") : String(entry?.name ?? "Untitled"),
        posterPath: tmdbImageUrl(entry?.poster_path ?? null, "w342", imageProxyEnabled),
        reason: overlapBoost > 0 ? `${reason} and aligned with titles you liked` : reason,
        score: applyMoodScore(
          scoreSeededDiscoveryCandidate(tmdbId, rating, scoreBase + overlapBoost, queueSeed, slot),
          preferences.mood,
          "discover",
          rating
        ),
        source: "discover",
        genreIds,
      });
    };

    const movieDiscoverResults = movieDiscoverPages.flatMap((page: any) => page?.results ?? []).slice(0, 16);
    const tvDiscoverResults = tvDiscoverPages.flatMap((page: any) => page?.results ?? []).slice(0, 16);

    for (const [index, entry] of movieDiscoverResults.entries()) {
      addDiscovery(
        "movie",
        entry,
        70,
        preferences.mood === "wildcard"
          ? "Wildcard movie pick tuned to your taste profile"
          : "High-confidence match from your taste profile",
        index
      );
    }
    for (const [index, entry] of tvDiscoverResults.entries()) {
      addDiscovery(
        "tv",
        entry,
        68,
        preferences.mood === "focused"
          ? "Focused TV pick with stronger quality weighting"
          : "Personalized pick based on your recent watch patterns",
        index
      );
    }

    // If horror is hidden and the candidate pool dries up, do a broader non-horror pass.
    if (items.length === 0 && preferences.hideHorror) {
      const broadParams: Record<string, string | number> = {
        sort_by: "popularity.desc",
        "vote_average.gte": 5.2,
        "vote_count.gte": 40,
        without_genres: 27,
      };

      const [fallbackMovies, fallbackTv] = await Promise.all([
        discoverMovies(broadParams, 1).catch(() => ({ results: [] })),
        discoverTv(broadParams, 1).catch(() => ({ results: [] })),
      ]);

      for (const [index, entry] of ((fallbackMovies as any)?.results ?? []).slice(0, 10).entries()) {
        addDiscovery("movie", entry, 60, "Broadened non-horror fallback pick", 100 + index);
      }

      for (const [index, entry] of ((fallbackTv as any)?.results ?? []).slice(0, 10).entries()) {
        addDiscovery("tv", entry, 58, "Broadened non-horror fallback pick", 200 + index);
      }
    }

    const sorted = items
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return jsonResponseWithETag(
      req,
      {
        items: sorted,
        preferences: {
          mood: preferences.mood,
          hideHorror: preferences.hideHorror,
        },
      }
    );
  } catch (error) {
    logger.error("[Tonight Queue] Error", error);
    return jsonResponseWithETag(
      req,
      {
        items: [],
        preferences: { mood: "wildcard", hideHorror: false },
        error: "Failed to build tonight queue",
      }
    );
  }
}
