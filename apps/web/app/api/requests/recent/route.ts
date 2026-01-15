import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { listRecentRequests, updateRequestMetadata } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

type RecentRequestCard = {
  id: string;
  tmdbId: number;
  title: string;
  year?: string;
  poster: string | null;
  backdrop: string | null;
  type: "movie" | "tv";
  status: string;
  username: string;
  avatarUrl?: string | null;
};

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const takeRaw = request.nextUrl.searchParams.get("take");
  const take = Math.min(Math.max(Number(takeRaw ?? 12), 1), 30);
  const imageProxyEnabled = await getImageProxyEnabled();

  const recentRequestsRaw = await listRecentRequests(take).catch(() => []);
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

        return {
          id: req.id,
          tmdbId: req.tmdb_id,
          title: req.title,
          year,
          poster: posterUrl,
          backdrop: backdropUrl,
          type,
          status: req.status,
          username: req.username,
          avatarUrl: req.avatar_url ?? null
        };
      } catch {
        return null;
      }
    })
  )).filter(Boolean) as RecentRequestCard[];

  return cacheableJsonResponseWithETag(request, { items: recentRequests }, { maxAge: 0, sMaxAge: 0, private: true });
}
