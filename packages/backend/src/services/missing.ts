import { prisma } from '../utils/prisma.js';

/**
 * "Missing" across the connected *arr services.
 *
 * Source of truth is the service itself (`/wanted/missing` for Radarr, `/wanted/missing` +
 * `/series` for Sonarr), not LeMedia's database: deleting a title in Radarr/Sonarr must make it
 * vanish here, and the *arr's own definition of missing (monitored, no file) is what the request
 * and search flows act on.
 *
 * Both endpoints return everything the cards need — title, year, runtime, added date, rating,
 * certification, genres and poster URLs — so no TMDB lookups are made. The full list is cached
 * briefly and paged/sorted in memory, which keeps the "See all" page instant and lets it offer
 * sorts (runtime, rating) that the *arr query API does not expose.
 */

export type { MissingType, MissingSort, MissingItem } from './missingSort.js';
export { MISSING_SORTS } from './missingSort.js';
import { DEFAULT_PAGE_SIZE, MISSING_SORTS, paginateMissingItems, sortMissingItems } from './missingSort.js';
import type { MissingItem, MissingPage, MissingSort, MissingType } from './missingSort.js';

const CACHE_TTL_MS = 3 * 60_000;
const ARR_PAGE_SIZE = 250;
const ARR_MAX_PAGES = 40;

const cache = new Map<MissingType, { at: number; items: MissingItem[] }>();

/** Called when an *arr reports a delete so the next read reflects it immediately. */
export function invalidateMissingCache(): void {
  cache.clear();
}

interface ArrListResponse {
  records?: Record<string, unknown>[];
  totalRecords?: number;
}

interface ArrApi {
  api: { get: (url: string, opts?: { params?: Record<string, unknown> }) => Promise<{ data: unknown }> };
}

function positive(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function imageUrl(images: unknown, coverType: string): string | null {
  if (!Array.isArray(images)) return null;
  const hit = images.find((i) => {
    const row = i as { coverType?: unknown; remoteUrl?: unknown; url?: unknown };
    return String(row.coverType ?? '') === coverType;
  }) as { remoteUrl?: unknown; url?: unknown } | undefined;
  return text(hit?.remoteUrl) ?? text(hit?.url) ?? null;
}

function isoDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw.slice(0, 10) : date.toISOString();
}

function arrClient(type: MissingType): Promise<ArrApi | null> {
  return (async () => {
    const { getServiceConfig } = await import('../utils/services.js');
    const { createArrClient } = await import('../providers/index.js');
    const config = await getServiceConfig(type === 'movie' ? 'radarr' : 'sonarr');
    if (!config) return null;
    try {
      return createArrClient(type === 'movie' ? 'radarr' : 'sonarr', config) as unknown as ArrApi;
    } catch {
      return null;
    }
  })();
}

/** Every page of a *arr list endpoint (they cap pageSize, so walk the range). */
async function fetchAllPages(client: ArrApi, path: string, params: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (let page = 1; page <= ARR_MAX_PAGES; page++) {
    const { data } = await client.api.get(path, { params: { ...params, page, pageSize: ARR_PAGE_SIZE } });
    const body = (data ?? {}) as ArrListResponse;
    const records = Array.isArray(body.records) ? body.records : Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
    out.push(...records);
    const total = positive(body.totalRecords) ?? records.length;
    if (records.length === 0 || out.length >= total) break;
  }
  return out;
}

async function loadMovies(): Promise<MissingItem[]> {
  const client = await arrClient('movie');
  if (!client) return [];
  const records = await fetchAllPages(client, '/wanted/missing', {
    sortKey: 'movieMetadata.added',
    sortDirection: 'descending',
  });
  const items: MissingItem[] = [];
  for (const row of records) {
    const tmdbId = positive(row.tmdbId);
    if (!tmdbId) continue;
    const ratings = row.ratings as Record<string, { value?: unknown }> | undefined;
    const rating = positive(ratings?.tmdb?.value) ?? positive(ratings?.imdb?.value) ?? positive(ratings?.critics?.value);
    items.push({
      id: tmdbId,
      mediaType: 'movie',
      title: text(row.title) ?? 'Unknown',
      posterPath: imageUrl(row.images, 'poster'),
      backdropPath: imageUrl(row.images, 'fanart'),
      releaseDate: isoDate(row.releaseDate) ?? isoDate(row.inCinemas),
      year: positive(row.year),
      runtime: positive(row.runtime),
      rating,
      addedAt: isoDate(row.added),
      overview: text(row.overview),
      certification: text(row.certification),
      genres: Array.isArray(row.genres) ? row.genres.filter((g): g is string => typeof g === 'string') : [],
    });
  }
  return items;
}

async function loadSeries(): Promise<MissingItem[]> {
  const client = await arrClient('tv');
  if (!client) return [];
  // Sonarr's wanted/missing is episode-level and already limited to monitored, aired episodes
  // (unmonitored rows are future/unwanted episodes, not gaps). Group by series for the browse page.
  const records = await fetchAllPages(client, '/wanted/missing', {
    sortKey: 'airDateUtc',
    sortDirection: 'descending',
    includeSeries: true,
    includeEpisode: true,
  });
  const bySeries = new Map<number, { series: Record<string, unknown>; missing: number; latestAir: string | null }>();
  for (const row of records) {
    const series = row.series as Record<string, unknown> | undefined;
    const seriesId = positive(row.seriesId) ?? positive(series?.id);
    if (!series || !seriesId) continue;
    const entry = bySeries.get(seriesId) ?? { series, missing: 0, latestAir: null };
    entry.missing += 1;
    const air = isoDate(row.airDateUtc);
    if (air && (!entry.latestAir || air > entry.latestAir)) entry.latestAir = air;
    bySeries.set(seriesId, entry);
  }

  const items: MissingItem[] = [];
  for (const { series, missing, latestAir } of bySeries.values()) {
    const tvdbId = positive(series.tvdbId) ?? undefined;
    const tmdbId = positive(series.tmdbId);
    const stats = series.statistics as Record<string, unknown> | undefined;
    const ratings = series.ratings as { value?: unknown } | undefined;
    const poster = imageUrl(series.images, 'poster');
    items.push({
      // A series without a TMDB id is still listed once its LeMedia row is known; the fallback
      // below fills the id so the card links to the right page.
      id: tmdbId ?? 0,
      tvdbId,
      mediaType: 'tv',
      title: text(series.title) ?? 'Unknown',
      posterPath: poster,
      backdropPath: imageUrl(series.images, 'fanart'),
      // "Recently added" means recently added to Sonarr, matching the movie row.
      releaseDate: isoDate(series.firstAired) ?? latestAir,
      year: positive(series.year),
      runtime: positive(series.runtime),
      rating: positive(ratings?.value),
      addedAt: isoDate(series.added),
      overview: text(series.overview),
      certification: text(series.certification),
      genres: Array.isArray(series.genres) ? series.genres.filter((g): g is string => typeof g === 'string') : [],
      missingEpisodes: missing,
      totalEpisodes: positive(stats?.episodeCount) ?? undefined,
    });
  }

  // Older Sonarr builds omit tmdbId; resolve those from the synced media rows.
  const unresolved = items.filter((i) => i.id <= 0 && i.tvdbId);
  if (unresolved.length) {
    const rows = await prisma.media.findMany({
      where: { mediaType: 'tv', tvdbId: { in: unresolved.map((i) => i.tvdbId as number) }, tmdbId: { gt: 0 } },
      select: { tvdbId: true, tmdbId: true },
    }).catch(() => []);
    const byTvdb = new Map(rows.map((r) => [r.tvdbId, r.tmdbId]));
    for (const item of unresolved) item.id = byTvdb.get(item.tvdbId as number) ?? 0;
  }
  return items.filter((i) => i.id > 0);
}

async function load(type: MissingType): Promise<MissingItem[]> {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.items;
  const items = type === 'movie' ? await loadMovies() : await loadSeries();
  cache.set(type, { at: Date.now(), items });
  return items;
}

export async function getMissing(type: MissingType, options: { page?: number; pageSize?: number; sort?: MissingSort; order?: 'asc' | 'desc' } = {}): Promise<MissingPage> {
  const sort = options.sort && MISSING_SORTS.includes(options.sort) ? options.sort : 'recent';
  const items = sortMissingItems(await load(type), sort, options.order);
  const page = paginateMissingItems(items, options.page ?? 1, options.pageSize ?? DEFAULT_PAGE_SIZE);
  return { results: page.results, total: items.length, page: page.page, pageSize: page.pageSize };
}
