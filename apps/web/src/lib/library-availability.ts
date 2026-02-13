import { listRadarrMovies } from "@/lib/radarr";
import { listSeries, sonarrQueue } from "@/lib/sonarr";
import { radarrQueue } from "@/lib/radarr";
import {
  AvailabilityStatus,
  getSeriesAvailabilityStatus,
  seriesHasFiles
} from "@/lib/media-status";
import { getAvailableSeasons, hasCachedEpisodeAvailability, hasRecentJellyfinAvailabilityScan, findActiveRequestsByTmdbIds } from "@/db";
import { getTv } from "@/lib/tmdb";

type CacheEntry = { expiresAt: number; map: Map<number, boolean> };
type StatusCacheEntry = { expiresAt: number; map: Map<number, AvailabilityStatus> };

const CACHE_TTL_MS = 60 * 1000;
const JELLYFIN_AVAILABILITY_MAX_AGE_MS = 6 * 60 * 60 * 1000;
let movieCache: CacheEntry | null = null;
let tvCache: CacheEntry | null = null;
let movieStatusCache: StatusCacheEntry | null = null;
let tvStatusCache: StatusCacheEntry | null = null;
let movieDownloadingCache: CacheEntry | null = null;
let tvDownloadingCache: CacheEntry | null = null;

function buildMovieMap(items: any[]): Map<number, boolean> {
  const map = new Map<number, boolean>();
  for (const item of items) {
    const tmdbId = Number(item?.tmdbId ?? item?.tmdb_id ?? 0);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    // Only mark as available if the movie has actually been downloaded
    const hasFile = Boolean(item?.hasFile);
    map.set(tmdbId, hasFile);
  }
  return map;
}

function buildTvMap(items: any[]): Map<number, boolean> {
  const map = new Map<number, boolean>();
  for (const item of items) {
    const tmdbId = Number(item?.tmdbId ?? item?.tmdb_id ?? 0);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    // Use shared utility for consistent file detection
    map.set(tmdbId, seriesHasFiles(item));
  }
  return map;
}

function buildMovieStatusMap(items: any[]): Map<number, AvailabilityStatus> {
  const map = new Map<number, AvailabilityStatus>();
  for (const item of items) {
    const tmdbId = Number(item?.tmdbId ?? item?.tmdb_id ?? 0);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    const hasFile = Boolean(item?.hasFile);
    map.set(tmdbId, hasFile ? "available" : "unavailable");
  }
  return map;
}

function buildTvStatusMap(items: any[]): Map<number, AvailabilityStatus> {
  const map = new Map<number, AvailabilityStatus>();
  for (const item of items) {
    const tmdbId = Number(item?.tmdbId ?? item?.tmdb_id ?? 0);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;

    // Use shared utility for consistent status detection
    const status = getSeriesAvailabilityStatus(item);
    map.set(tmdbId, status);
  }
  return map;
}

async function getAvailabilityMap(type: "movie" | "tv"): Promise<Map<number, boolean>> {
  const now = Date.now();
  const cache = type === "movie" ? movieCache : tvCache;
  if (cache && cache.expiresAt > now) return cache.map;

  if (type === "movie") {
    const items = await listRadarrMovies().catch(() => []);
    const map = buildMovieMap(items);
    movieCache = { expiresAt: now + CACHE_TTL_MS, map };
    return map;
  }

  const items = await listSeries().catch(() => []);
  const map = buildTvMap(items);
  tvCache = { expiresAt: now + CACHE_TTL_MS, map };
  return map;
}

async function getAvailabilityStatusMap(type: "movie" | "tv"): Promise<Map<number, AvailabilityStatus>> {
  const now = Date.now();
  const cache = type === "movie" ? movieStatusCache : tvStatusCache;
  if (cache && cache.expiresAt > now) return cache.map;

  if (type === "movie") {
    const items = await listRadarrMovies().catch(() => []);
    const map = buildMovieStatusMap(items);
    movieStatusCache = { expiresAt: now + CACHE_TTL_MS, map };
    return map;
  }

  const items = await listSeries().catch(() => []);
  const map = buildTvStatusMap(items);
  tvStatusCache = { expiresAt: now + CACHE_TTL_MS, map };
  return map;
}

async function getDownloadingMap(type: "movie" | "tv"): Promise<Map<number, boolean>> {
  const now = Date.now();
  const cache = type === "movie" ? movieDownloadingCache : tvDownloadingCache;
  if (cache && cache.expiresAt > now) return cache.map;

  if (type === "movie") {
    const queue: any = await radarrQueue(1, 100).catch(() => ({ records: [] }));
    const records = Array.isArray(queue?.records) ? queue.records : [];
    const map = new Map<number, boolean>();
    for (const item of records) {
      const tmdbId = Number(item?.movie?.tmdbId ?? item?.tmdbId ?? 0);
      if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
      const status = String(item?.status ?? item?.trackedDownloadStatus ?? "").toLowerCase();
      const isActive = status !== "completed" && status !== "failed";
      if (isActive) map.set(tmdbId, true);
    }
    movieDownloadingCache = { expiresAt: now + 15_000, map };
    return map;
  }

  const queue: any = await sonarrQueue(1, 100).catch(() => ({ records: [] }));
  const records = Array.isArray(queue?.records) ? queue.records : [];
  const map = new Map<number, boolean>();
  for (const item of records) {
    const tmdbId = Number(item?.series?.tmdbId ?? item?.tmdbId ?? 0);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    const status = String(item?.status ?? item?.trackedDownloadStatus ?? "").toLowerCase();
    const isActive = status !== "completed" && status !== "failed";
    if (isActive) map.set(tmdbId, true);
  }
  tvDownloadingCache = { expiresAt: now + 15_000, map };
  return map;
}

export async function getAvailabilityByTmdbIds(type: "movie" | "tv", ids: number[]) {
  const map = await getAvailabilityMap(type);
  const out: Record<number, boolean> = {};
  for (const id of ids) {
    out[id] = Boolean(map.get(id));
  }
  return out;
}

export async function getAvailabilityStatusByTmdbIds(type: "movie" | "tv", ids: number[]) {
  const map = await getAvailabilityStatusMap(type);
  const downloadingMap = await getDownloadingMap(type);

  // Check for active requests (submitted, pending, queued)
  const requestType = type === "movie" ? "movie" : "episode";
  const activeRequests = await findActiveRequestsByTmdbIds({ requestType, tmdbIds: ids }).catch(() => []);
  const requestMap = new Map<number, string>();
  for (const req of activeRequests) {
    requestMap.set(req.tmdb_id, req.status);
  }

  if (type !== "tv") {
    const out: Record<number, string> = {};
    for (const id of ids) {
      const availStatus = map.get(id) ?? "unavailable";
      const requestStatus = requestMap.get(id);
      if (downloadingMap.get(id)) {
        out[id] = "downloading";
      } else
      // Keep showing downloading until the item is fully available.
      if (requestStatus === "downloading" && availStatus !== "available") {
        out[id] = requestStatus;
      } else if (availStatus === "unavailable" && requestStatus) {
        // If unavailable but has active request, use request status instead.
        out[id] = requestStatus;
      } else {
        out[id] = availStatus;
      }
    }
    return out;
  }

  const hasRecentJellyfinScan = await hasRecentJellyfinAvailabilityScan(JELLYFIN_AVAILABILITY_MAX_AGE_MS).catch(
    () => false
  );

  const entries = await Promise.all(
    ids.map(async (id) => {
      const baseStatus = map.get(id) ?? "unavailable";
      let status = baseStatus;
      let availableSeasons: number[] = [];

      try {
        availableSeasons = await getAvailableSeasons({ tmdbId: id });
      } catch {
        availableSeasons = [];
      }

      const seasonCount = availableSeasons.filter((season) => Number(season) > 0).length;
      let hasJellyfinEpisodes = seasonCount > 0;
      if (!hasJellyfinEpisodes && hasRecentJellyfinScan) {
        try {
          hasJellyfinEpisodes = await hasCachedEpisodeAvailability({ tmdbId: id });
        } catch {
          hasJellyfinEpisodes = false;
        }
      }

      if (hasJellyfinEpisodes) {
        const tv = await getTv(id).catch(() => null);
        const totalSeasons = Number(tv?.number_of_seasons ?? 0);

        if (totalSeasons > 0) {
          status = seasonCount >= totalSeasons ? "available" : "partially_available";
        } else if (status === "unavailable") {
          status = "available";
        }
      }

      const requestStatus = requestMap.get(id);
      if (downloadingMap.get(id)) {
        return [id, "downloading"] as const;
      }
      // Keep showing downloading until the show is fully available.
      if (requestStatus === "downloading" && status !== "available") {
        return [id, requestStatus] as const;
      }
      // If unavailable but has active request, use request status instead.
      if (status === "unavailable" && requestStatus) {
        return [id, requestStatus] as const;
      }
      return [id, status] as const;
    })
  );

  return Object.fromEntries(entries);
}
