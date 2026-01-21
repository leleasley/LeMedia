import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { listRadarrMovies } from "@/lib/radarr";
import { listSeries } from "@/lib/sonarr";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import {
  MediaStatus,
  seriesHasFiles,
  isSeriesPartiallyAvailable,
  STATUS_STRINGS
} from "@/lib/media-status";

const MAX_TAKE = 40;
const DEFAULT_TAKE = 20;
const SERVICE_TIMEOUT_MS = 2500;

type RecentItem = {
  id: number;
  title: string;
  year: string;
  poster: string | null;
  overview?: string;
  type: "movie" | "tv";
  addedAt: number;
  available: boolean;
  mediaStatus: number;
};

function findPosterUrl(images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>) {
  if (!images?.length) return null;
  const poster = images.find(img => img.coverType === "poster") ?? images[0];
  return poster?.remoteUrl ?? poster?.url ?? null;
}

function isTmdbPoster(url?: string | null) {
  return Boolean(url && url.includes("image.tmdb.org"));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise.catch(() => fallback), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const takeRaw = request.nextUrl.searchParams.get("take");
  const take = Math.min(Math.max(Number(takeRaw ?? DEFAULT_TAKE), 1), MAX_TAKE);
  const imageProxyEnabled = await getImageProxyEnabled();

  const [radarrMoviesRaw, sonarrSeriesRaw] = await Promise.all([
    withTimeout(listRadarrMovies(), SERVICE_TIMEOUT_MS, [] as any[]),
    withTimeout(listSeries(), SERVICE_TIMEOUT_MS, [] as any[]),
  ]);

  const recentMovies = (
    await Promise.all(
      (radarrMoviesRaw ?? []).map(async (movie: any) => {
        if (!movie?.tmdbId) return null;
        let poster = findPosterUrl(movie.images) ?? null;
        if (!isTmdbPoster(poster)) {
          const details = await getMovie(movie.tmdbId).catch(() => null);
          poster = tmdbImageUrl(details?.poster_path, "w500", imageProxyEnabled);
        }
        const hasFile = Boolean(movie.hasFile || movie.downloaded);
        return {
          id: movie.tmdbId,
          title: movie.title ?? "Untitled",
          year: movie.year ? String(movie.year) : "",
          poster,
          overview: movie.overview ?? "",
          type: "movie" as const,
          addedAt: movie.added ? new Date(movie.added).getTime() : 0,
          available: hasFile,
          mediaStatus: hasFile ? MediaStatus.AVAILABLE : MediaStatus.DOWNLOADING
        };
      })
    )
  ).filter(Boolean) as RecentItem[];

  const recentSeries = (
    await Promise.all(
      (sonarrSeriesRaw ?? []).map(async (series: any) => {
        if (!series?.tmdbId) return null;
        let poster = findPosterUrl(series.images) ?? null;
        if (!isTmdbPoster(poster)) {
          const details = await getTv(series.tmdbId).catch(() => null);
          poster = tmdbImageUrl(details?.poster_path, "w500", imageProxyEnabled);
        }

        // Use shared utilities for consistent status detection
        const hasSomeFiles = seriesHasFiles(series);
        const isPartial = isSeriesPartiallyAvailable(series);

        return {
          id: series.tmdbId,
          title: series.title ?? "Untitled",
          year: series.year ? String(series.year) : "",
          poster,
          overview: series.overview ?? "",
          type: "tv" as const,
          addedAt: series.added ? new Date(series.added).getTime() : 0,
          available: hasSomeFiles,
          mediaStatus: isPartial ? MediaStatus.PARTIALLY_AVAILABLE : hasSomeFiles ? MediaStatus.AVAILABLE : MediaStatus.DOWNLOADING
        };
      })
    )
  ).filter(Boolean) as RecentItem[];

  const items = [...recentMovies, ...recentSeries]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, take)
    .map(item => ({
      id: item.id,
      title: item.title,
      posterUrl: item.poster,
      year: item.year,
      rating: undefined,
      description: item.overview,
      type: item.type,
      mediaStatus: item.mediaStatus,
      statusBadge: item.mediaStatus === MediaStatus.PARTIALLY_AVAILABLE
        ? STATUS_STRINGS.PARTIALLY_AVAILABLE
        : item.available
          ? STATUS_STRINGS.AVAILABLE
          : undefined
    }));

  return cacheableJsonResponseWithETag(request, { items }, { maxAge: 20, sMaxAge: 60 });
}
