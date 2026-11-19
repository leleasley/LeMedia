import axios from 'axios';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';
import { getAppSettings } from '../utils/appSettings.js';
import { getTmdbApi } from './tmdb.js';
import { getZurgConn, type ZurgConn } from './zurg/client.js';

/**
 * "Recently added" from Zurg's own library, for installs that do not run Radarr/Sonarr.
 *
 * Zurg's WebDAV view of `__magic__` is already sorted by title (`movies/Title (Year)/…`,
 * `tv/Show/…`), and each collection carries a `getlastmodified` that reflects when the release
 * landed in the debrid account. A scan maps those folders to TMDB ids and writes the usual Media
 * rows, so the existing Recently Added / availability queries work unchanged.
 *
 * Opt-in (`AppSettings.zurgRecentEnabled`): an *arr setup already gets this from webhooks and the
 * sync job, and a scan over a large library costs a TMDB search per unknown title.
 */

const MAX_NEW_PER_RUN = 40;
const LOOKBACK_DAYS = 30;
const PROP_TIMEOUT_MS = 30_000;

export interface ZurgRecentResult {
  skipped?: string;
  scanned: number;
  matched: number;
  created: number;
  updated: number;
  unmatched: number;
}

interface Entry { title: string; year: number | null; addedAt: Date; path: string }

const strip = (s: string) => s
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/** `Title (1999)` → title + year; TV folders often omit the year. */
function parseFolder(name: string): { title: string; year: number | null } {
  const m = /^(.*?)\s*\((\d{4})\)\s*$/.exec(name);
  if (m) return { title: m[1].trim(), year: Number(m[2]) };
  return { title: name.trim(), year: null };
}

async function propfind(conn: ZurgConn, path: string): Promise<Entry[]> {
  const auth = conn.auth ? 'Basic ' + Buffer.from(`${conn.auth.username}:${conn.auth.password}`).toString('base64') : undefined;
  const { data } = await axios.request<string>({
    method: 'PROPFIND',
    url: `${conn.base}${path}`,
    headers: { Depth: '1', ...(auth ? { Authorization: auth } : {}) },
    timeout: PROP_TIMEOUT_MS,
    responseType: 'text',
    maxContentLength: 32 * 1024 * 1024,
    validateStatus: (s) => s === 207 || s === 200,
  });

  const out: Entry[] = [];
  for (const match of data.matchAll(/<d:response>([\s\S]*?)<\/d:response>/g)) {
    const block = match[1];
    if (!block.includes('<d:collection/>')) continue;
    const href = /<d:href>([^<]+)<\/d:href>/.exec(block)?.[1] ?? '';
    const lastModified = /<d:getlastmodified>([^<]+)<\/d:getlastmodified>/.exec(block)?.[1] ?? '';
    const name = decodeURIComponent(href.replace(/\/+$/, '').split('/').pop() ?? '');
    if (!name || name === 'movies' || name === 'tv') continue;
    const addedAt = new Date(lastModified);
    if (Number.isNaN(addedAt.getTime())) continue;
    const { title, year } = parseFolder(name);
    if (!title) continue;
    out.push({ title, year, addedAt, path: decodeURIComponent(href) });
  }
  return out;
}

interface SearchHit { id: number; title: string; year: number | null; poster: string | null; backdrop: string | null; overview: string | null; }

async function search(kind: 'movie' | 'tv', title: string, year: number | null): Promise<SearchHit | null> {
  const api = getTmdbApi();
  const params: Record<string, unknown> = { query: title, include_adult: true };
  if (year) {
    if (kind === 'movie') params.year = year;
    else params.first_air_date_year = year;
  }
  const { data } = await api.get(`/search/${kind}`, { params });
  const results = Array.isArray(data?.results) ? data.results as Record<string, unknown>[] : [];
  const wanted = strip(title);

  for (const row of results) {
    const name = String((kind === 'movie' ? row.title : row.name) ?? '');
    if (!name || strip(name) !== wanted) continue;
    const date = String((kind === 'movie' ? row.release_date : row.first_air_date) ?? '');
    const hitYear = date ? Number(date.slice(0, 4)) : null;
    // A year is only decisive when both sides have one; TV folders often omit it.
    if (year && hitYear && Math.abs(hitYear - year) > 1) continue;
    return {
      id: Number(row.id),
      title: name,
      year: hitYear,
      poster: typeof row.poster_path === 'string' ? row.poster_path : null,
      backdrop: typeof row.backdrop_path === 'string' ? row.backdrop_path : null,
      overview: typeof row.overview === 'string' ? row.overview : null,
    };
  }
  return null;
}

/** One scan pass. Safe to run repeatedly: rows are upserted and only newer dates win. */
export async function scanZurgRecent(): Promise<ZurgRecentResult> {
  const settings = await getAppSettings();
  if (!settings?.zurgRecentEnabled) return { skipped: 'disabled', scanned: 0, matched: 0, created: 0, updated: 0, unmatched: 0 };

  const conn = await getZurgConn().catch(() => null);
  if (!conn) return { skipped: 'zurg not configured', scanned: 0, matched: 0, created: 0, updated: 0, unmatched: 0 };

  const cutoff = Date.now() - LOOKBACK_DAYS * 24 * 3600_000;
  const [movies, shows] = await Promise.all([
    propfind(conn, '/dav/__magic__/movies').catch(() => []),
    propfind(conn, '/dav/__magic__/tv').catch(() => []),
  ]);
  const fresh = [...movies.map((e) => ({ ...e, kind: 'movie' as const })), ...shows.map((e) => ({ ...e, kind: 'tv' as const }))]
    .filter((e) => e.addedAt.getTime() >= cutoff)
    .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());

  // Match folders against existing rows by a normalised title (case, punctuation and "&" vs
  // "and" differ between TMDB and Zurg's folder names). One query instead of one per folder.
  const rows = await prisma.media.findMany({
    where: { mediaType: { in: ['movie', 'tv'] } },
    select: { id: true, tmdbId: true, title: true, mediaType: true, availableAt: true, statusCategory: true },
  });
  const byTitle = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = `${row.mediaType}:${strip(row.title)}`;
    if (!byTitle.has(key)) byTitle.set(key, row);
  }

  let matched = 0, created = 0, updated = 0, unmatched = 0, lookups = 0;
  for (const entry of fresh) {
    try {
      const known = byTitle.get(`${entry.kind}:${strip(entry.title)}`);

      if (known) {
        const newer = !known.availableAt || known.availableAt.getTime() < entry.addedAt.getTime();
        await prisma.media.update({
          where: { id: known.id },
          data: {
            ...(newer ? { availableAt: entry.addedAt } : {}),
            ...(known.statusCategory === 'AVAILABLE' ? {} : { statusCategory: 'AVAILABLE' }),
            libraryConfirmedAt: new Date(),
            zurgPath: entry.path,
            // "Found in Zurg" is independent of the *arrs: the file is in Zurg's library, so the
            // badge applies even when Radarr/Sonarr also know the title. The "not in Radarr or
            // Sonarr" prompt keys on the *arr ids being absent instead.
            source: 'zurg',
          },
        });
        updated++;
        continue;
      }

      if (lookups >= MAX_NEW_PER_RUN) continue;
      lookups++;
      const hit = await search(entry.kind, entry.title, entry.year);
      if (!hit || !Number.isSafeInteger(hit.id) || hit.id <= 0) { unmatched++; continue; }
      matched++;

      await prisma.media.upsert({
        where: { tmdbId_mediaType: { tmdbId: hit.id, mediaType: entry.kind } },
        create: {
          tmdbId: hit.id,
          mediaType: entry.kind,
          title: hit.title,
          overview: hit.overview,
          posterPath: hit.poster,
          backdropPath: hit.backdrop,
          releaseDate: hit.year ? `${hit.year}-01-01` : null,
          statusCategory: 'AVAILABLE',
          availableAt: entry.addedAt,
          libraryConfirmedAt: new Date(),
          source: 'zurg',
          zurgPath: entry.path,
        },
        update: {
          statusCategory: 'AVAILABLE',
          availableAt: entry.addedAt,
          libraryConfirmedAt: new Date(),
          // Never overwrite the marker here: this branch also catches rows that already belong
          // to an *arr, and those are not "Zurg-only". The create branch below is the only place
          // a row is born as Zurg-sourced.
          zurgPath: entry.path,
        },
      });
      created++;
    } catch (err) {
      // One bad title must not stop the scan.
      logEvent('debug', 'Zurg', `Recently-added scan skipped "${entry.title}": ${String(err)}`);
    }
  }

  const result: ZurgRecentResult = { scanned: fresh.length, matched, created, updated, unmatched };
  if (created || updated) {
    logEvent('info', 'Zurg', `Recently-added scan: ${created} new, ${updated} updated from Zurg's library (${fresh.length} recent folders)`);
  }
  return result;
}
