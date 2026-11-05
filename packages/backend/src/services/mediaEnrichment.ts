import { createHash } from 'node:crypto';
import { getCached, setCache } from '../utils/cache.js';
import { getTmdbApi, getReleaseRegion } from './tmdb.js';
import { getMdblistApiKey } from './lists/engine.js';

type Kind = 'movie' | 'tv';
export type Rating = { source: 'imdb' | 'tomatoes' | 'metacritic'; value: number };
export type WatchProvider = { id: number; name: string; logo: string | null };
export type WatchOptions = { region: string; link: string | null; stream: WatchProvider[]; rent: WatchProvider[]; buy: WatchProvider[] };

export function normalizeRatings(input: unknown): Rating[] {
  if (!Array.isArray(input)) return [];
  const result: Rating[] = [];
  for (const row of input) {
    if (!row || typeof row !== 'object') continue;
    const { source, value } = row as { source?: unknown; value?: unknown };
    if (source !== 'imdb' && source !== 'tomatoes' && source !== 'metacritic') continue;
    if ((typeof value !== 'number' && typeof value !== 'string') || value === '') continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0 || n > (source === 'imdb' ? 10 : 100) || result.some(r => r.source === source)) continue;
    result.push({ source, value: n });
  }
  return result;
}

export async function getTitleRatings(kind: Kind, id: number): Promise<Rating[]> {
  const key = await getMdblistApiKey();
  if (!key) return [];
  const keyHash = createHash('sha256').update(key).digest('hex').slice(0, 16);
  const cacheKey = `ratings:mdblist:v1:${keyHash}:${kind}:${id}`;
  const cached = await getCached<Rating[]>(cacheKey);
  if (cached) return cached;
  try {
    const url = new URL(`https://api.mdblist.com/tmdb/${kind === 'tv' ? 'show' : 'movie'}/${id}`);
    url.searchParams.set('apikey', key);
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) return [];
    const data = await response.json() as { ratings?: unknown };
    const ratings = normalizeRatings(data.ratings);
    await setCache(cacheKey, ratings, 24);
    return ratings;
  } catch { return []; }
}

export async function getTitleWatchOptions(kind: Kind, id: number): Promise<WatchOptions | null> {
  const region = getReleaseRegion();
  const cacheKey = `watch-options:v1:${kind}:${id}:${region}`;
  const cached = await getCached<WatchOptions>(cacheKey);
  if (cached) return cached;
  const { data } = await getTmdbApi().get(`/${kind}/${id}/watch/providers`);
  const entry = data?.results?.[region];
  if (!entry || typeof entry !== 'object') return null;
  const list = (value: unknown): WatchProvider[] => Array.isArray(value) ? value.flatMap(item => {
    if (!item || !Number.isInteger(item.provider_id) || typeof item.provider_name !== 'string') return [];
    return [{ id: item.provider_id as number, name: item.provider_name as string, logo: typeof item.logo_path === 'string' && /^\/[\w.-]+$/.test(item.logo_path) ? item.logo_path as string : null }];
  }) : [];
  let link: string | null = null;
  try { const url = new URL(entry.link); if (url.protocol === 'https:' && url.hostname === 'www.themoviedb.org') link = url.toString(); } catch { /* no usable link */ }
  const options = { region, link, stream: list(entry.flatrate), rent: list(entry.rent), buy: list(entry.buy) };
  await setCache(cacheKey, options, 12);
  return options;
}
