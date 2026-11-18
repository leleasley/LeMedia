import type { ArrClient } from '../providers/types.js';
import { getArrClient, getServiceTypeForMedia } from '../providers/index.js';
import { prisma } from '../utils/prisma.js';
import { deleteCached } from '../utils/cache.js';
import { logEvent } from '../utils/logEvent.js';
import { resolveMetadataSource } from './serviceMetadata.js';

export class SeriesLinkError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'SeriesLinkError';
  }
}

/** One Sonarr lookup hit, reduced to what the picker needs. */
export interface SeriesCandidate {
  tvdbId: number;
  title: string;
  year: number | null;
  tmdbId: number | null;
  imdbId: string | null;
  seasonCount: number;
  /** The series is already in Sonarr's library (a lookup hit alone does not say so). */
  inLibrary: boolean;
  /** The lookup carries a TMDB id that differs from the title being linked. Expected for split
   *  shows: TVDB folds Top Boy 2011 and 2019 into one record. The UI warns instead of hiding it. */
  tmdbMismatch: boolean;
}

/** Sonarr-only capability (`/series/lookup`); not part of the shared ArrClient contract. */
type SeriesLookupClient = ArrClient & {
  lookupSeries?: (term: string) => Promise<Record<string, unknown>[]>;
  lookupByTvdbId?: (tvdbId: number) => Promise<Record<string, unknown> | null>;
};

async function sonarrClient(): Promise<SeriesLookupClient> {
  const client = await getArrClient('sonarr') as SeriesLookupClient;
  if (!client.lookupByTvdbId || !client.lookupSeries) {
    throw new SeriesLinkError('Sonarr lookup is unavailable on this instance', 503);
  }
  return client;
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;

function toCandidate(record: Record<string, unknown>, tmdbId: number | null, library: Set<number>): SeriesCandidate | null {
  const tvdbId = asNumber(record.tvdbId);
  const title = typeof record.title === 'string' ? record.title : null;
  if (!tvdbId || !title) return null;
  const candidateTmdb = asNumber(record.tmdbId);
  const seasons = Array.isArray(record.seasons) ? record.seasons : [];
  return {
    tvdbId,
    title,
    year: asNumber(record.year),
    tmdbId: candidateTmdb,
    imdbId: typeof record.imdbId === 'string' && record.imdbId ? record.imdbId : null,
    seasonCount: seasons.filter((s) => asNumber((s as { seasonNumber?: unknown }).seasonNumber) !== null).length,
    inLibrary: library.has(tvdbId),
    tmdbMismatch: !!tmdbId && !!candidateTmdb && candidateTmdb !== tmdbId,
  };
}

/** Search Sonarr's metadata provider. `term` may be a title or an id term (`tvdb:253138`). */
export async function searchSeries(term: string, tmdbId: number | null = null): Promise<SeriesCandidate[]> {
  const query = term.trim();
  if (!query) throw new SeriesLinkError('Enter a title or a TVDB id');

  const client = await sonarrClient();
  const [records, library] = await Promise.all([
    client.lookupSeries!(query),
    client.getAllMedia().catch(() => []),
  ]);
  const known = new Set(library.filter((item) => item.externalId > 0).map((item) => item.externalId));

  const seen = new Set<number>();
  const out: SeriesCandidate[] = [];
  for (const record of records) {
    const candidate = toCandidate(record, tmdbId, known);
    if (!candidate || seen.has(candidate.tvdbId)) continue;
    seen.add(candidate.tvdbId);
    out.push(candidate);
    if (out.length === 20) break;
  }
  return out;
}

/** Drop any cached service metadata for this title so the next detail load re-resolves against
 *  the newly linked TVDB id instead of serving the pre-link payload until its TTL expires. */
async function invalidateMetadata(tmdbId: number): Promise<void> {
  try {
    const source = await resolveMetadataSource(tmdbId, 'tv');
    if (source) await deleteCached(source.cacheKey);
  } catch {
    // Best-effort: a stale miss only costs one upstream lookup.
  }
}

/**
 * Bind a TMDB row to the Sonarr series an admin picked. This is the explicit override for shows
 * the two metadata providers key differently (Top Boy 2011/2019). An automatic title match is
 * deliberately not attempted anywhere — persisting an approximate match is how a request ends up
 * on the wrong series.
 */
export async function linkSeries(
  tmdbId: number,
  tvdbId: number,
): Promise<{ title: string; tvdbId: number; tmdbId: number | null; seasonCount: number }> {
  const media = await prisma.media.findUnique({ where: { tmdbId_mediaType: { tmdbId, mediaType: 'tv' } } });
  if (!media) throw new SeriesLinkError(`TMDB ${tmdbId} is not in the database yet`, 404);

  const client = await sonarrClient();
  const record = await client.lookupByTvdbId!(tvdbId);
  if (!record) throw new SeriesLinkError(`TVDB ${tvdbId} is not a series Sonarr knows`, 400);

  const changed = media.tvdbId !== tvdbId;
  await prisma.media.update({
    where: { id: media.id },
    data: {
      tvdbId,
      tvdbLinkedAt: new Date(),
      // A different series means the previous *arr id belongs to something else. Clearing it is
      // safer than leaving a stale id that would resolve to another show on the next dispatch.
      ...(changed ? { sonarrId: null } : {}),
    },
  });
  await invalidateMetadata(tmdbId);

  const title = typeof record.title === 'string' ? record.title : media.title;
  const seasonCount = Array.isArray(record.seasons) ? record.seasons.length : 0;
  logEvent('info', 'Arr', `Linked "${media.title}" (TMDB ${tmdbId}) to Sonarr series "${title}" (TVDB ${tvdbId})`);
  return { title, tvdbId, tmdbId: asNumber(record.tmdbId), seasonCount };
}

/** Remove an operator link so the row goes back to TMDB-driven resolution. */
export async function unlinkSeries(tmdbId: number): Promise<void> {
  const media = await prisma.media.findUnique({ where: { tmdbId_mediaType: { tmdbId, mediaType: 'tv' } } });
  if (!media) throw new SeriesLinkError(`TMDB ${tmdbId} is not in the database yet`, 404);
  if (!media.tvdbLinkedAt) throw new SeriesLinkError('This title has no manual link', 400);

  await prisma.media.update({
    where: { id: media.id },
    // sonarrId goes too: it belongs to the linked series, and keeping it after the link is gone
    // would point the next dispatch at a show this title no longer claims to be.
    data: { tvdbId: null, tvdbLinkedAt: null, sonarrId: null },
  });
  await invalidateMetadata(tmdbId);
  logEvent('info', 'Arr', `Removed the manual Sonarr link for "${media.title}" (TMDB ${tmdbId})`);
}

/** Current link state for the admin picker. */
export async function linkState(tmdbId: number) {
  const media = await prisma.media.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType: 'tv' } },
    select: { tvdbId: true, tvdbLinkedAt: true, sonarrId: true, title: true },
  });
  if (!media) return null;

  let seriesTitle: string | null = null;
  if (media.tvdbId) {
    const client = await getArrClient('sonarr').catch(() => null);
    // Bind explicitly: the method reads this.api, so a detached reference would throw.
    const lookup = (client as SeriesLookupClient | null)?.lookupByTvdbId;
    if (client && lookup) {
      const record = await lookup.call(client, media.tvdbId).catch(() => null);
      seriesTitle = typeof record?.title === 'string' ? record.title : null;
    }
  }
  return {
    tvdbId: media.tvdbId,
    linkedManually: !!media.tvdbLinkedAt,
    linkedAt: media.tvdbLinkedAt,
    seriesTitle,
    serviceType: getServiceTypeForMedia('tv'),
  };
}
