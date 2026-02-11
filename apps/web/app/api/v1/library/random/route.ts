import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { listRadarrMovies } from "@/lib/radarr";
import { listSeries } from "@/lib/sonarr";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { jsonResponseWithETag } from "@/lib/api-optimization";

function findPosterUrl(images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>) {
  if (!images?.length) return null;
  const poster = images.find(img => img.coverType === "poster") ?? null;
  return poster?.remoteUrl ?? poster?.url ?? null;
}

function isTmdbPoster(url?: string | null) {
  return Boolean(url && url.includes("image.tmdb.org"));
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const imageProxyEnabled = await getImageProxyEnabled();

  const [movies, series] = await Promise.all([
    listRadarrMovies().catch(() => [] as any[]),
    listSeries().catch(() => [] as any[]),
  ]);

  const availableMovies = (movies ?? []).filter((m: any) => m?.tmdbId && (m.hasFile || m.downloaded));
  const availableSeries = (series ?? []).filter((s: any) => {
    const files = Number(s?.statistics?.episodeFileCount) || 0;
    return s?.tmdbId && files > 0;
  });

  const allItems = [
    ...availableMovies.map((m: any) => ({ ...m, _type: "movie" as const })),
    ...availableSeries.map((s: any) => ({ ...s, _type: "tv" as const })),
  ];

  if (!allItems.length) {
    return jsonResponseWithETag(req, { item: null });
  }

  const picked = allItems[Math.floor(Math.random() * allItems.length)];

  let poster = findPosterUrl(picked.images) ?? null;
  let backdrop: string | null = null;
  if (picked._type === "movie") {
    if (!isTmdbPoster(poster)) {
      const details = await getMovie(picked.tmdbId).catch(() => null);
      poster = tmdbImageUrl(details?.poster_path, "w500", imageProxyEnabled);
      backdrop = tmdbImageUrl(details?.backdrop_path, "w780", imageProxyEnabled);
    } else {
      const details = await getMovie(picked.tmdbId).catch(() => null);
      backdrop = tmdbImageUrl(details?.backdrop_path, "w780", imageProxyEnabled);
    }
  } else {
    if (!isTmdbPoster(poster)) {
      const details = await getTv(picked.tmdbId).catch(() => null);
      poster = tmdbImageUrl(details?.poster_path, "w500", imageProxyEnabled);
      backdrop = tmdbImageUrl(details?.backdrop_path, "w780", imageProxyEnabled);
    } else {
      const details = await getTv(picked.tmdbId).catch(() => null);
      backdrop = tmdbImageUrl(details?.backdrop_path, "w780", imageProxyEnabled);
    }
  }

  return jsonResponseWithETag(req, {
    item: {
      id: picked.tmdbId,
      title: picked.title ?? "Untitled",
      year: picked.year ? String(picked.year) : "",
      poster,
      backdrop,
      type: picked._type,
      overview: picked.overview ?? "",
    },
  });
}
