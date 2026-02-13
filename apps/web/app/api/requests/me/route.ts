import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { listRequestsByUsername, updateRequestMetadata } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getActiveDownloadTmdbIds, shouldForceDownloading } from "@/lib/download-status";
import { getAvailabilityStatusByTmdbIds } from "@/lib/library-availability";

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const imageProxyEnabled = await getImageProxyEnabled();
    const activeDownloads = await getActiveDownloadTmdbIds();
    const requests = await listRequestsByUsername(user.username);
    const movieIds = requests.filter((r) => r.request_type === "movie").map((r) => r.tmdb_id);
    const tvIds = requests.filter((r) => r.request_type !== "movie").map((r) => r.tmdb_id);
    const [movieAvailability, tvAvailability] = await Promise.all([
      movieIds.length ? getAvailabilityStatusByTmdbIds("movie", movieIds).catch(() => ({} as Record<number, string>)) : Promise.resolve({} as Record<number, string>),
      tvIds.length ? getAvailabilityStatusByTmdbIds("tv", tvIds).catch(() => ({} as Record<number, string>)) : Promise.resolve({} as Record<number, string>)
    ]);
    const tmdbResults = await Promise.allSettled(
      requests.map((req) => {
        const hasAllLocal = req.poster_path && req.release_year;
        if (hasAllLocal) return Promise.resolve(null);
        const type = req.request_type === "movie" ? "movie" : "tv";
        return type === "movie" ? getMovie(req.tmdb_id) : getTv(req.tmdb_id);
      })
    );

    const detailed = await Promise.all(
      requests.map(async (r, idx) => {
        try {
          const detailsResult = tmdbResults[idx];
          const details = detailsResult?.status === "fulfilled" ? detailsResult.value : null;
          if (details && (!r.poster_path || !r.release_year)) {
            void updateRequestMetadata({
              requestId: r.id,
              posterPath: details?.poster_path ?? null,
              backdropPath: details?.backdrop_path ?? null,
              releaseYear: r.request_type === "movie"
                ? Number(details?.release_date?.slice(0, 4)) || null
                : Number(details?.first_air_date?.slice(0, 4)) || null
            }).catch(() => undefined);
          }
          const posterPath = r.poster_path ?? details?.poster_path ?? null;
          const posterUrl = posterPath ? tmdbImageUrl(posterPath, "w200", imageProxyEnabled) : null;
          const mediaType = r.request_type === "movie" ? "movie" : "tv";
          const availabilityStatus = mediaType === "movie" ? movieAvailability[r.tmdb_id] : tvAvailability[r.tmdb_id];
          const resolvedStatus = shouldForceDownloading({
            status: r.status,
            tmdbId: r.tmdb_id,
            mediaType: r.request_type as "movie" | "episode",
            active: activeDownloads
          }) ? "downloading"
            : availabilityStatus === "available"
              ? "available"
              : availabilityStatus === "partially_available"
                ? "partially_available"
                : r.status;
          return {
            ...r,
            status: resolvedStatus,
            posterUrl
          };
        } catch {
          const mediaType = r.request_type === "movie" ? "movie" : "tv";
          const availabilityStatus = mediaType === "movie" ? movieAvailability[r.tmdb_id] : tvAvailability[r.tmdb_id];
          const resolvedStatus = shouldForceDownloading({
            status: r.status,
            tmdbId: r.tmdb_id,
            mediaType: r.request_type as "movie" | "episode",
            active: activeDownloads
          }) ? "downloading"
            : availabilityStatus === "available"
              ? "available"
              : availabilityStatus === "partially_available"
                ? "partially_available"
                : r.status;
          return {
            ...r,
            status: resolvedStatus,
            posterUrl: null
          };
        }
      })
    );

    return cacheableJsonResponseWithETag(req, { requests: detailed }, { maxAge: 0, sMaxAge: 0, private: true });
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}
