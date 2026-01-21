import { listRadarrMovies } from "@/lib/radarr";
import { listSeries } from "@/lib/sonarr";
import {
  AvailabilityStatus,
  getSeriesAvailabilityStatus,
  seriesHasFiles,
  STATUS_STRINGS
} from "@/lib/media-status";

type CacheEntry = { expiresAt: number; map: Map<number, boolean> };
type StatusCacheEntry = { expiresAt: number; map: Map<number, AvailabilityStatus> };

const CACHE_TTL_MS = 60 * 1000;
let movieCache: CacheEntry | null = null;
let tvCache: CacheEntry | null = null;
let movieStatusCache: StatusCacheEntry | null = null;
let tvStatusCache: StatusCacheEntry | null = null;

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
  const out: Record<number, AvailabilityStatus> = {};
  for (const id of ids) {
    out[id] = map.get(id) ?? "unavailable";
  }
  return out;
}
