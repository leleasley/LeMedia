import { listRadarrMovies } from "@/lib/radarr";
import { listSeries } from "@/lib/sonarr";

type CacheEntry = { expiresAt: number; map: Map<number, boolean> };
const CACHE_TTL_MS = 60 * 1000;
let movieCache: CacheEntry | null = null;
let tvCache: CacheEntry | null = null;

function buildMovieMap(items: any[]): Map<number, boolean> {
  const map = new Map<number, boolean>();
  for (const item of items) {
    const tmdbId = Number(item?.tmdbId ?? item?.tmdb_id ?? 0);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    // Mark as available once it exists in Radarr, regardless of file status.
    map.set(tmdbId, true);
  }
  return map;
}

function buildTvMap(items: any[]): Map<number, boolean> {
  const map = new Map<number, boolean>();
  for (const item of items) {
    const tmdbId = Number(item?.tmdbId ?? item?.tmdb_id ?? 0);
    if (!Number.isFinite(tmdbId) || tmdbId <= 0) continue;
    // Mark as available once it exists in Sonarr.
    map.set(tmdbId, true);
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

export async function getAvailabilityByTmdbIds(type: "movie" | "tv", ids: number[]) {
  const map = await getAvailabilityMap(type);
  const out: Record<number, boolean> = {};
  for (const id of ids) {
    out[id] = Boolean(map.get(id));
  }
  return out;
}
