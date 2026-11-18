import axios from 'axios';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';
import { getZurgConn } from './zurg/client.js';
import { dmmService } from './dmmWantedImport.js';

/**
 * The sponsor's wanted list, read through DMM's Radarr/Sonarr-compatible API.
 *
 * This deliberately avoids `/api/sponsor/wanted`: that endpoint marks the list as polled by zurg,
 * which would make zurg look healthier than it is. The arr API is the same view Seerr gets — every
 * wanted title with `monitored` (still on the list) and `hasFile` (zurg fetched it) — and reading
 * it changes nothing.
 *
 * Removing a title is DMM's `unwant`, exposed as `DELETE /movie/{tmdbId}` or `/series/{tvdbId}`.
 */

const BASE = 'https://debridmediamanager.com/api/arr';
const TIMEOUT_MS = 20_000;
/** The list can hold 10,000 titles; the page shows a slice and filters it locally. */
const MAX_ITEMS = 500;
const CACHE_MS = 30_000;

export type WantedApp = 'radarr' | 'sonarr';

export interface WantedTitle {
  app: WantedApp;
  /** TMDB id for movies, TVDB id for series — DMM's own ids, and what DELETE takes. */
  id: number;
  title: string;
  year: number | null;
  imdbId: string | null;
  /** Still on the wanted list (not removed). */
  wanted: boolean;
  /** zurg acknowledged/handled it. */
  fetched: boolean;
  /** Seasons still wanted, for series (null = the whole show). */
  seasons: number[] | null;
  addedAt: string | null;
}

export interface WantedSnapshot {
  items: WantedTitle[];
  total: number;
  wanted: number;
  fetched: number;
  truncated: boolean;
}

let cache: { at: number; snapshot: WantedSnapshot } | null = null;

/** Invalidate after a write so the next read reflects it. */
export function resetWantedListCache(): void {
  cache = null;
}

interface RawMovie {
  id?: unknown; tmdbId?: unknown; title?: unknown; year?: unknown;
  imdbId?: unknown; monitored?: unknown; hasFile?: unknown; added?: unknown;
}
interface RawSeries extends RawMovie {
  tvdbId?: unknown;
  seasons?: { seasonNumber?: unknown; monitored?: unknown }[];
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null);

function movie(row: RawMovie): WantedTitle | null {
  const id = num(row.tmdbId) ?? num(row.id);
  if (!id || typeof row.title !== 'string') return null;
  return {
    app: 'radarr', id, title: row.title,
    year: num(row.year),
    imdbId: typeof row.imdbId === 'string' ? row.imdbId : null,
    wanted: row.monitored !== false,
    fetched: row.hasFile === true,
    seasons: null,
    addedAt: typeof row.added === 'string' ? row.added : null,
  };
}

function series(row: RawSeries): WantedTitle | null {
  const id = num(row.tvdbId) ?? num(row.id);
  if (!id || typeof row.title !== 'string') return null;
  const seasons = Array.isArray(row.seasons)
    ? row.seasons.filter((s) => s?.monitored === true && typeof s.seasonNumber === 'number').map((s) => s.seasonNumber as number)
    : [];
  return {
    app: 'sonarr', id, title: row.title,
    year: num(row.year),
    imdbId: typeof row.imdbId === 'string' ? row.imdbId : null,
    wanted: row.monitored !== false,
    fetched: row.hasFile === true,
    // An empty array means "no particular season" — DMM tracks whole-show wants as null.
    seasons: seasons.length ? seasons.sort((a, b) => a - b) : null,
    addedAt: typeof row.added === 'string' ? row.added : null,
  };
}

async function get(apiKey: string, path: string): Promise<unknown> {
  const { data } = await axios.get(`${BASE}/${path}`, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
    timeout: TIMEOUT_MS, maxRedirects: 0,
  });
  return data;
}

/** Everything on the wanted list. Throws when DMM is unreachable; callers decide how to degrade. */
export async function wantedList(force = false): Promise<WantedSnapshot> {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.snapshot;

  const service = await dmmService();
  if (!service) return { items: [], total: 0, wanted: 0, fetched: 0, truncated: false };

  const [movieRows, seriesRows] = await Promise.all([
    get(service.apiKey, 'radarr/api/v3/movie').catch(() => []),
    get(service.apiKey, 'sonarr/api/v3/series').catch(() => []),
  ]);

  const items: WantedTitle[] = [
    ...(Array.isArray(movieRows) ? movieRows.map((r) => movie(r as RawMovie)) : []),
    ...(Array.isArray(seriesRows) ? seriesRows.map((r) => series(r as RawSeries)) : []),
  ].filter((x): x is WantedTitle => x !== null);

  // Still-wanted first, then newest — the useful order for a page about what is left to fetch.
  items.sort((a, b) => (Number(b.wanted) - Number(a.wanted)) || (b.addedAt ?? '').localeCompare(a.addedAt ?? ''));

  const snapshot: WantedSnapshot = {
    items: items.slice(0, MAX_ITEMS),
    total: items.length,
    wanted: items.filter((i) => i.wanted && !i.fetched).length,
    fetched: items.filter((i) => i.fetched).length,
    truncated: items.length > MAX_ITEMS,
  };
  cache = { at: Date.now(), snapshot };
  return snapshot;
}

/** Remove one title from the wanted list. Returns false when it was not there. */
export async function unwant(app: WantedApp, id: number): Promise<boolean> {
  const service = await dmmService();
  if (!service) return false;

  const path = `${app}/api/v3/${app === 'radarr' ? 'movie' : 'series'}/${id}`;
  const response = await axios.delete(`${BASE}/${path}`, {
    headers: { 'X-API-Key': service.apiKey, Accept: 'application/json' },
    timeout: TIMEOUT_MS, maxRedirects: 0, validateStatus: () => true,
  }).catch(() => { throw new Error('Could not reach Debrid Media Manager'); });

  resetWantedListCache();
  if (response.status === 404) return false;
  if (response.status >= 400) throw new Error(`DMM refused to remove that title (HTTP ${response.status})`);
  return true;
}

/**
 * Remove a title from the wanted list only when nobody still wants it here.
 *
 * Called after a request is declined or deleted, and after a title is deleted from LeMedia. A
 * pending/approved/processing request is somebody still waiting, so the title stays wanted; a
 * fetched title is left alone because zurg already has it.
 */
export async function maybeUnwant(media: {
  id: number; tmdbId: number; tvdbId: number | null; mediaType: string; title: string;
}): Promise<boolean> {
  try {
    const service = await dmmService();
    if (!service) return false;

    const stillWanted = await prisma.mediaRequest.count({
      where: { mediaId: media.id, status: { in: ['pending', 'approved', 'processing'] } },
    });
    if (stillWanted > 0) return false;

    // DMM's ids are TMDB for films and TVDB for series; a series without a TVDB id cannot be
    // addressed here (and is not on the list under a name we can match).
    const app: WantedApp = media.mediaType === 'movie' ? 'radarr' : 'sonarr';
    const id = media.mediaType === 'movie' ? media.tmdbId : media.tvdbId;
    if (!id) return false;

    const removed = await unwant(app, id);
    if (removed) logEvent('info', 'DMM', `Removed "${media.title}" from the wanted list — no active request left`);
    return removed;
  } catch (err) {
    logEvent('warn', 'DMM', `Could not remove "${media.title}" from the wanted list: ${String(err)}`);
    return false;
  }
}

/** zurg's DMM source present? Used to explain an empty list on the page. */
export async function dmmWantedContext(): Promise<{ zurg: boolean }> {
  return { zurg: !!(await getZurgConn().catch(() => null)) };
}
