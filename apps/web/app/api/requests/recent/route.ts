import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { listRecentRequests, updateRequestMetadata } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getActiveDownloadTmdbIds, shouldForceDownloading } from "@/lib/download-status";
import { getAvailabilityStatusByTmdbIds } from "@/lib/library-availability";

type RecentRequestCard = {
  id: string;
  tmdbId: number;
  title: string;
  year?: string;
  description?: string;
  poster: string | null;
  backdrop: string | null;
  type: "movie" | "tv";
  status: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  jellyfinUserId?: string | null;
};

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const takeRaw = request.nextUrl.searchParams.get("take");
  const take = Math.min(Math.max(Number(takeRaw ?? 12), 1), 30);
  const imageProxyEnabled = await getImageProxyEnabled();
  const activeDownloads = await getActiveDownloadTmdbIds();

  const recentRequestsRaw = await listRecentRequests(take, user.username).catch(() => []);
  const movieIds = recentRequestsRaw.filter((req) => req.request_type === "movie").map((req) => req.tmdb_id);
  const tvIds = recentRequestsRaw.filter((req) => req.request_type !== "movie").map((req) => req.tmdb_id);
  const [movieAvailability, tvAvailability] = await Promise.all([
    movieIds.length ? getAvailabilityStatusByTmdbIds("movie", movieIds).catch(() => ({} as Record<number, string>)) : Promise.resolve({} as Record<number, string>),
    tvIds.length ? getAvailabilityStatusByTmdbIds("tv", tvIds).catch(() => ({} as Record<number, string>)) : Promise.resolve({} as Record<number, string>)
  ]);
  const tmdbResults = await Promise.allSettled(
    recentRequestsRaw.map((req) => {
      const hasAllLocal = req.poster_path && req.backdrop_path && req.release_year;
      if (hasAllLocal) return Promise.resolve(null);
      const type = req.request_type === "movie" ? "movie" : "tv";
      return type === "movie" ? getMovie(req.tmdb_id) : getTv(req.tmdb_id);
    })
  );
  const recentRequests: RecentRequestCard[] = (await Promise.all(
    recentRequestsRaw.map(async (req, idx) => {
      try {
        const type = req.request_type === "movie" ? "movie" : "tv";
        const detailsResult = tmdbResults[idx];
        const details = detailsResult?.status === "fulfilled" ? detailsResult.value : null;
        if (details && (!req.poster_path || !req.backdrop_path || !req.release_year)) {
          void updateRequestMetadata({
            requestId: req.id,
            posterPath: details?.poster_path ?? null,
            backdropPath: details?.backdrop_path ?? null,
            releaseYear: type === "movie"
              ? Number(details?.release_date?.slice(0, 4)) || null
              : Number(details?.first_air_date?.slice(0, 4)) || null
          }).catch(() => undefined);
        }

        const year = req.release_year
          ? String(req.release_year)
          : type === "movie"
            ? (details?.release_date ?? "").slice(0, 4)
            : (details?.first_air_date ?? "").slice(0, 4);

        const backdropPath = req.backdrop_path ?? details?.backdrop_path ?? null;
        const backdropUrl = backdropPath
          ? tmdbImageUrl(backdropPath, "w780", imageProxyEnabled)
          : null;

        const posterPath = req.poster_path ?? details?.poster_path ?? null;
        const posterUrl = posterPath
          ? tmdbImageUrl(posterPath, "w500", imageProxyEnabled)
          : null;
        const availabilityStatus =
          type === "movie"
            ? movieAvailability[req.tmdb_id]
            : tvAvailability[req.tmdb_id];
        const resolvedStatus = shouldForceDownloading({
          status: req.status,
          tmdbId: req.tmdb_id,
          mediaType: type,
          active: activeDownloads
        })
          ? "downloading"
          : availabilityStatus === "available"
            ? "available"
            : availabilityStatus === "partially_available"
              ? "partially_available"
              : req.status;

        return {
          id: req.id,
          tmdbId: req.tmdb_id,
          title: req.title,
          year,
          description: (req as any).overview ?? details?.overview ?? "",
          poster: posterUrl,
          backdrop: backdropUrl,
          type,
          status: resolvedStatus,
          username: req.username,
          displayName: (req as any).display_name ?? null,
          avatarUrl: req.avatar_url ?? null,
          jellyfinUserId: req.jellyfin_user_id ?? null
        };
      } catch {
        return null;
      }
    })
  )).filter(Boolean) as RecentRequestCard[];

  return cacheableJsonResponseWithETag(request, { items: recentRequests }, { maxAge: 0, sMaxAge: 0, private: true });
}
