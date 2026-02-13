import { radarrQueue } from "@/lib/radarr";
import { sonarrQueue } from "@/lib/sonarr";

export async function getActiveDownloadTmdbIds(): Promise<{ movie: Set<number>; tv: Set<number> }> {
  const [radarr, sonarr] = await Promise.all([
    radarrQueue(1, 200).catch(() => ({ records: [] })),
    sonarrQueue(1, 200).catch(() => ({ records: [] }))
  ]);

  const movie = new Set<number>();
  const tv = new Set<number>();

  const radarrRecords = Array.isArray((radarr as any)?.records) ? (radarr as any).records : [];
  for (const item of radarrRecords) {
    const tmdbId = Number(item?.movie?.tmdbId ?? item?.tmdbId ?? 0);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    const status = String(item?.status ?? item?.trackedDownloadStatus ?? "").toLowerCase();
    if (status !== "completed" && status !== "failed") movie.add(tmdbId);
  }

  const sonarrRecords = Array.isArray((sonarr as any)?.records) ? (sonarr as any).records : [];
  for (const item of sonarrRecords) {
    const tmdbId = Number(item?.series?.tmdbId ?? item?.tmdbId ?? 0);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    const status = String(item?.status ?? item?.trackedDownloadStatus ?? "").toLowerCase();
    if (status !== "completed" && status !== "failed") tv.add(tmdbId);
  }

  return { movie, tv };
}

export function shouldForceDownloading(input: {
  status: string;
  tmdbId: number;
  mediaType: "movie" | "tv" | "episode";
  active: { movie: Set<number>; tv: Set<number> };
}): boolean {
  if (input.mediaType === "movie") return input.active.movie.has(input.tmdbId);
  return input.active.tv.has(input.tmdbId);
}
