import { prisma } from '../utils/prisma.js';
import { parseServiceConfig } from '../utils/services.js';
import { logEvent } from '../utils/logEvent.js';
import { trimTrailingSlashes } from '../utils/trimTrailingSlashes.js';
import { getMovieDetails, getTvDetails } from './tmdb.js';

/**
 * Reads what is actually present in the user's media server library.
 *
 * LeMedia has never had this: the Plex provider only does authentication and user sharing, so
 * "available" could only ever mean "the *arr reported a file". That is right most of the time and
 * wrong exactly when it hurts — the library has not been rescanned, and the user clicks a title
 * their player cannot find.
 *
 * Titles are joined on the TMDB/TVDB ids Plex exposes as `Guid`, never on file paths: paths differ
 * between the *arr's view and the media server's view as soon as either runs in a container.
 */

export interface LibraryEntry {
  tmdbId: number | null;
  tvdbId: number | null;
  /** 'movie' | 'tv', derived from the section type. */
  mediaType: 'movie' | 'tv';
  /** Plex's own metadata — only used to seed the catalogue on an *arr-less install. */
  title?: string;
  year?: number | null;
  addedAt?: Date | null;
}

interface PlexGuid { id?: string }

interface PlexItem {
  ratingKey?: string | number;
  Guid?: PlexGuid[];
  title?: string;
  year?: number;
  /** Epoch seconds. */
  addedAt?: number;
}

interface PlexSection {
  key?: string;
  type?: string;
}

const PAGE_SIZE = 500;
const REQUEST_TIMEOUT_MS = 20_000;

/** Last successful scan's keys, `null` until one completes (so "unknown" ≠ "not owned"). */
let libraryKeys: Set<string> | null = null;

/** Does the configured media server currently hold this title? `null` when no scan has run. */
export function isInMediaServerLibrary(mediaType: string, tmdbId: number | null, tvdbId: number | null): boolean | null {
  if (!libraryKeys) return null;
  const type = mediaType === 'tv' ? 'tv' : 'movie';
  if (tmdbId && libraryKeys.has(`${type}:tmdb:${tmdbId}`)) return true;
  if (type === 'tv' && tvdbId && libraryKeys.has(`tv:tvdb:${tvdbId}`)) return true;
  return false;
}

function parseGuids(guids: PlexGuid[] | undefined): { tmdbId: number | null; tvdbId: number | null } {
  let tmdbId: number | null = null;
  let tvdbId: number | null = null;
  for (const g of guids ?? []) {
    const id = g.id ?? '';
    if (id.startsWith('tmdb://')) {
      const n = Number.parseInt(id.slice(7), 10);
      if (Number.isFinite(n)) tmdbId = n;
    } else if (id.startsWith('tvdb://')) {
      const n = Number.parseInt(id.slice(7), 10);
      if (Number.isFinite(n)) tvdbId = n;
    }
  }
  return { tmdbId, tvdbId };
}

async function plexGet(baseUrl: string, token: string, path: string, params: Record<string, string | number> = {}) {
  const url = new URL(path, trimTrailingSlashes(baseUrl) + '/');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'X-Plex-Token': token },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Plex ${path} → HTTP ${res.status}`);
    return await res.json() as { MediaContainer?: Record<string, unknown> };
  } finally {
    clearTimeout(timer);
  }
}

/** Movie and show sections only — music and photo libraries have nothing LeMedia can match. */
async function plexSections(baseUrl: string, token: string): Promise<PlexSection[]> {
  const body = await plexGet(baseUrl, token, 'library/sections');
  const dirs = (body.MediaContainer?.Directory ?? []) as PlexSection[];
  return dirs.filter((d) => d.type === 'movie' || d.type === 'show');
}

/** One section, paginated. `includeGuids=1` is what surfaces the tmdb/tvdb ids. */
async function plexSectionItems(baseUrl: string, token: string, section: PlexSection): Promise<LibraryEntry[]> {
  const mediaType: 'movie' | 'tv' = section.type === 'movie' ? 'movie' : 'tv';
  const entries: LibraryEntry[] = [];
  let offset = 0;

  for (;;) {
    const body = await plexGet(baseUrl, token, `library/sections/${section.key}/all`, {
      includeGuids: 1,
      'X-Plex-Container-Start': offset,
      'X-Plex-Container-Size': PAGE_SIZE,
    });
    const items = (body.MediaContainer?.Metadata ?? []) as PlexItem[];
    for (const item of items) {
      const { tmdbId, tvdbId } = parseGuids(item.Guid);
      if (tmdbId === null && tvdbId === null) continue;
      entries.push({
        tmdbId, tvdbId, mediaType,
        title: typeof item.title === 'string' ? item.title : undefined,
        year: Number.isFinite(item.year) ? Number(item.year) : null,
        addedAt: Number.isFinite(item.addedAt) ? new Date(Number(item.addedAt) * 1000) : null,
      });
    }
    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return entries;
}

/** Null when no usable Plex server is configured — the caller treats that as "cannot confirm". */
async function plexCredentials(): Promise<{ url: string; token: string } | null> {
  const service = await prisma.service.findFirst({ where: { type: 'plex', enabled: true } });
  if (!service) return null;
  const config = parseServiceConfig(service.config);
  if (!config.url || !config.token) return null;
  return { url: config.url, token: config.token };
}

/**
 * Everything the configured media server currently holds.
 *
 * Only Plex is implemented. Jellyfin and Emby are configured in LeMedia for authentication only,
 * and their library APIs have not been verified here — returning null for them is deliberate, so
 * an unverified integration can never silently mark a whole library as unconfirmed.
 */
export async function readLibrary(): Promise<LibraryEntry[] | null> {
  const creds = await plexCredentials();
  if (!creds) return null;

  let sections: PlexSection[];
  try {
    sections = await plexSections(creds.url, creds.token);
  } catch (err) {
    // No section list means we learned nothing at all.
    logEvent('warn', 'Library', `Media server library scan failed: ${(err as Error).message}`);
    return null;
  }

  // Per-section isolation. A full library is several paginated requests; wrapping them in one
  // try/catch meant a single hiccup discarded thousands of titles and reported a clean zero.
  // Partial results are safe here because libraryConfirmedAt is a persistent stamp: a section that
  // failed simply is not refreshed this round, and everything it confirmed before stays confirmed.
  const all: LibraryEntry[] = [];
  let failed = 0;
  for (const section of sections) {
    try {
      all.push(...await plexSectionItems(creds.url, creds.token, section));
    } catch (err) {
      failed++;
      logEvent('warn', 'Library', `Library section ${section.key} unreadable, skipped: ${(err as Error).message}`);
    }
  }

  // Every section failing is indistinguishable from an outage — say so rather than reporting an
  // empty library, which would read as "nothing is confirmed".
  if (failed > 0 && all.length === 0) return null;
  return all;
}

/**
 * Stamps `libraryConfirmedAt` on every media the server currently holds.
 *
 * A failed or unconfigured scan returns 0 and stamps nothing: absence of evidence must not be read
 * as evidence of absence, or one unreachable Plex would flip an entire library back to IMPORTED.
 */
/** Catalogue seeding + poster backfill for installs with no Radarr/Sonarr at all. */

/** Chunked so SQLite stays under its bound-variable limit. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Seed LeMedia's catalogue from the media server when no *arr is configured.
 *
 * With Radarr/Sonarr the *arr sync is the catalogue; a DMM-only install has no such source, so
 * without this the app only ever knew titles someone had requested. Rows are created as
 * AVAILABLE with Plex's own `addedAt`, which also makes "Recently added" truthful.
 *
 * Posters come from TMDB in a bounded batch afterwards (Plex thumbnails need the Plex token),
 * newest first so the homepage fills in first.
 */
export async function importLibraryCatalog(entries: LibraryEntry[]): Promise<number> {
  const arr = await prisma.service.count({ where: { type: { in: ['radarr', 'sonarr'] }, enabled: true } });
  if (arr > 0) return 0;

  const now = new Date();
  const seen = new Set<string>();
  const wanted = entries.filter((e) => {
    if (!e.tmdbId) return false;
    const key = `${e.mediaType}:${e.tmdbId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (wanted.length === 0) return 0;

  const existing = await prisma.media.findMany({
    where: {
      OR: [
        { mediaType: 'movie', tmdbId: { in: wanted.filter((e) => e.mediaType === 'movie').map((e) => e.tmdbId as number) } },
        { mediaType: 'tv', tmdbId: { in: wanted.filter((e) => e.mediaType === 'tv').map((e) => e.tmdbId as number) } },
      ],
    },
    select: { tmdbId: true, mediaType: true },
  });
  const known = new Set(existing.map((r) => `${r.mediaType}:${r.tmdbId}`));

  const rows = wanted
    .filter((e) => !known.has(`${e.mediaType}:${e.tmdbId}`))
    .map((e) => ({
      tmdbId: e.tmdbId as number,
      tvdbId: e.mediaType === 'tv' ? e.tvdbId : null,
      mediaType: e.mediaType,
      title: e.title?.trim() || `TMDB ${e.tmdbId}`,
      releaseDate: e.year ? `${e.year}-01-01` : null,
      statusCategory: 'AVAILABLE',
      availableAt: e.addedAt ?? now,
      libraryConfirmedAt: now,
    }));
  if (rows.length === 0) return 0;

  let imported = 0;
  for (const batch of chunk(rows, 50)) {
    const result = await prisma.media.createMany({ data: batch, skipDuplicates: true }).catch((err) => {
      logEvent('warn', 'Library', `Catalogue import batch failed: ${(err as Error).message}`);
      return { count: 0 };
    });
    imported += result.count;
  }
  if (imported > 0) logEvent('info', 'Library', `Imported ${imported} title(s) from the media server into LeMedia`);
  return imported;
}

/** Fill in TMDB posters/metadata for catalogue rows that have none yet. */
export async function enrichLibraryPosters(limit = 120): Promise<number> {
  const rows = await prisma.media.findMany({
    where: { posterPath: null, tmdbId: { gt: 0 } },
    orderBy: { availableAt: 'desc' },
    take: limit,
    select: { id: true, tmdbId: true, mediaType: true },
  });
  if (rows.length === 0) return 0;

  let enriched = 0;
  // Small pool: TMDB's public token is shared, and one bad title must not stall the rest.
  for (const batch of chunk(rows, 6)) {
    await Promise.all(batch.map(async (row) => {
      try {
        const detail = row.mediaType === 'movie'
          ? await getMovieDetails(row.tmdbId)
          : await getTvDetails(row.tmdbId);
        const d = detail as {
          poster_path?: string | null; backdrop_path?: string | null; overview?: string | null;
          vote_average?: number | null; release_date?: string; first_air_date?: string;
          content_ratings?: { results?: { rating?: string }[] };
        };
        if (!d.poster_path) return;
        const isMovie = row.mediaType === 'movie';
        await prisma.media.update({
          where: { id: row.id },
          data: {
            posterPath: d.poster_path,
            backdropPath: d.backdrop_path ?? null,
            overview: d.overview ?? null,
            voteAverage: d.vote_average ?? null,
            ...(isMovie ? { releaseDate: d.release_date ?? undefined } : { releaseDate: d.first_air_date ?? undefined }),
            ...(isMovie ? {} : { contentRating: d.content_ratings?.results?.find((r) => r.rating)?.rating ?? undefined }),
          },
        });
        enriched++;
      } catch { /* a title TMDB cannot answer stays posterless; it is retried next scan */ }
    }));
  }
  return enriched;
}

export async function syncLibraryConfirmations(): Promise<{ scanned: number; confirmed: number; imported?: number; enriched?: number }> {
  const entries = await readLibrary();
  if (entries === null) return { scanned: 0, confirmed: 0 };

  // Snapshot for "do I already own this?" checks in the request flow. Rebuilt per scan so a
  // title deleted from the server becomes requestable again on the next pass.
  const keys = new Set<string>();
  for (const entry of entries) {
    if (entry.tmdbId !== null) keys.add(`${entry.mediaType}:tmdb:${entry.tmdbId}`);
    if (entry.mediaType === 'tv' && entry.tvdbId !== null) keys.add(`tv:tvdb:${entry.tvdbId}`);
  }
  libraryKeys = keys;

  const now = new Date();
  let confirmed = 0;

  // Grouped by media type so a tmdbId collision across namespaces cannot confirm the wrong row.
  for (const mediaType of ['movie', 'tv'] as const) {
    const forType = entries.filter((e) => e.mediaType === mediaType);
    const tmdbIds = [...new Set(forType.map((e) => e.tmdbId).filter((v): v is number => v !== null))];
    const tvdbIds = [...new Set(forType.map((e) => e.tvdbId).filter((v): v is number => v !== null))];

    if (tmdbIds.length > 0) {
      const { count } = await prisma.media.updateMany({
        where: { mediaType, tmdbId: { in: tmdbIds } },
        data: { libraryConfirmedAt: now },
      });
      confirmed += count;
    }
    // Sonarr keys on TVDB, so a series Plex knows by tvdb id alone still has to be reachable.
    if (mediaType === 'tv' && tvdbIds.length > 0) {
      const { count } = await prisma.media.updateMany({
        where: { mediaType, tvdbId: { in: tvdbIds }, libraryConfirmedAt: { not: now } },
        data: { libraryConfirmedAt: now },
      });
      confirmed += count;
    }
  }

  // No *arr configured (a DMM/Zurg-only install): the media server *is* the catalogue. With an
  // *arr the sync already owns the catalogue, so neither import nor poster backfill runs.
  const arrConfigured = (await prisma.service.count({ where: { type: { in: ['radarr', 'sonarr'] }, enabled: true } })) > 0;
  const imported = arrConfigured ? 0 : await importLibraryCatalog(entries).catch((err) => {
    logEvent('warn', 'Library', `Catalogue import skipped: ${(err as Error).message}`);
    return 0;
  });
  const enriched = arrConfigured ? 0 : await enrichLibraryPosters().catch(() => 0);

  logEvent('info', 'Library', `Media server library scan: ${entries.length} title(s) seen, ${confirmed} media row(s) confirmed`
    + (imported > 0 ? `, ${imported} imported` : '')
    + (enriched > 0 ? `, ${enriched} poster(s) added` : ''));
  return { scanned: entries.length, confirmed, imported, ...(enriched > 0 ? { enriched } : {}) };
}
