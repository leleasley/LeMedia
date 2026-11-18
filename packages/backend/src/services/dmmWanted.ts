import axios from 'axios';
import { prisma } from '../utils/prisma.js';
import { parseServiceConfig } from '../utils/services.js';
import { logEvent } from '../utils/logEvent.js';

/**
 * DMM's wanted list, used to turn a Zurg "dmm" job back into a title.
 *
 * Zurg reports DMM work by DMM's own wanted-item id; the list supplies TMDB/TVDB/IMDb. A film
 * leaves the list once Zurg acknowledges the fetch, so the map is also refreshed while jobs are
 * still pending — by the time one finishes, its ids are usually already known.
 *
 * Reading the list updates DMM's "last polled" stamp, so this is called only when Zurg actually
 * has DMM jobs in its snapshot (never from a health check).
 */

export interface DmmWantedItem {
  id: string;
  kind: 'movie' | 'show';
  title: string;
  imdb?: string;
  year?: number;
  tmdb?: number;
  tvdb?: number;
  seasons?: { season: number; episodes?: number[]; airing?: boolean }[];
}

const URL = 'https://debridmediamanager.com/api/sponsor/wanted';
const TTL_MS = 3 * 60_000;
let cache: { at: number; map: Map<string, DmmWantedItem> } | null = null;
let lastError: string | null = null;

async function apiKey(): Promise<string | null> {
  const rows = await prisma.service.findMany({ where: { type: 'dmm', enabled: true }, orderBy: { id: 'asc' } });
  for (const row of rows) {
    const key = parseServiceConfig(row.config).apiKey?.trim();
    if (key) return key;
  }
  return null;
}

function positive(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

/** id → wanted item. Empty map when DMM is not configured or unreachable. */
export async function getWantedMap(force = false): Promise<Map<string, DmmWantedItem>> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.map;
  const key = await apiKey();
  if (!key) return cache?.map ?? new Map();
  try {
    const { data } = await axios.get(URL, {
      headers: { 'X-API-Key': key, Accept: 'application/json' },
      timeout: 12_000, maxRedirects: 0,
    });
    const items = Array.isArray((data as { items?: unknown })?.items) ? (data as { items: Record<string, unknown>[] }).items : [];
    const map = new Map<string, DmmWantedItem>();
    for (const raw of items) {
      const id = String(raw.id ?? '');
      const kind = raw.kind === 'show' ? 'show' : raw.kind === 'movie' ? 'movie' : null;
      if (!id || !kind) continue;
      map.set(id, {
        id,
        kind,
        title: String(raw.title ?? ''),
        imdb: typeof raw.imdb === 'string' ? raw.imdb : undefined,
        year: positive(raw.year),
        tmdb: positive(raw.tmdb),
        tvdb: positive(raw.tvdb),
        seasons: Array.isArray(raw.seasons) ? (raw.seasons as DmmWantedItem['seasons']) : undefined,
      });
    }
    cache = { at: Date.now(), map };
    lastError = null;
    return map;
  } catch (err) {
    const detail = axios.isAxiosError(err) ? `HTTP ${err.response?.status ?? '?'} ${String(err.response?.data ?? '').slice(0, 120)}` : String(err);
    if (lastError !== detail) {
      lastError = detail;
      logEvent('warn', 'DMM', `Wanted list unavailable: ${detail}`);
    }
    return cache?.map ?? new Map();
  }
}

/** Zurg ids look like `<wanted id>[@band][:grab]`. */
export function wantedIdFromJob(id: string): string {
  return id.split(':')[0].split('@')[0];
}

export function resetWantedCache(): void {
  cache = null;
}
