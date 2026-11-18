import type { ProviderMediaMetadata } from '@lemedia/shared';
import type { ArrClient } from '../providers/types.js';
import { prisma } from '../utils/prisma.js';

/** Why a TMDB id could not become a service series id.
 *  - `not-found`: the *arr's metadata provider has no series keyed to this TMDB id. Ordinary for
 *    split shows (Top Boy 2011/2019), where TVDB keeps one record and TMDB keeps two.
 *  - `lookup-failed`: transport/auth problem talking to the *arr.
 *  - `conflict` / `invalid`: the service answered, but the identity contradicts what is stored. */
export type SeriesIdentityFailure = 'not-found' | 'lookup-failed' | 'conflict' | 'invalid';

export class SeriesIdentityError extends Error {
  constructor(
    readonly reason: SeriesIdentityFailure,
    message: string,
    /** HTTP status from the *arr, when the failure was a response rather than the payload. */
    readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = 'SeriesIdentityError';
  }
}

/** A shared guard for detail lookups and dispatch; never persist an approximate title match. */
export async function rememberSeriesIdentity(tmdbId: number, metadata: ProviderMediaMetadata): Promise<number> {
  if (metadata.tmdbId !== tmdbId || !Number.isSafeInteger(metadata.tvdbId) || metadata.tvdbId! <= 0) {
    throw new SeriesIdentityError('invalid', `Invalid service identity for TMDB ${tmdbId}`);
  }
  await prisma.media.updateMany({ where: { tmdbId, mediaType: 'tv', tvdbId: null }, data: { tvdbId: metadata.tvdbId } });
  const existing = await prisma.media.findUnique({ where: { tmdbId_mediaType: { tmdbId, mediaType: 'tv' } }, select: { tvdbId: true } });
  if (existing?.tvdbId && existing.tvdbId !== metadata.tvdbId) {
    throw new SeriesIdentityError('conflict', `Conflicting service identity for TMDB ${tmdbId}`);
  }
  return metadata.tvdbId!;
}

export async function resolveSeriesIdentity(client: ArrClient, media: { tmdbId: number; tvdbId: number | null }): Promise<number> {
  // An explicit link (or a stored id from a previous lookup) is authoritative: ask the service to
  // resolve by TVDB, which is the id Sonarr actually speaks, instead of by the TMDB id it may not
  // know. This is what makes split shows work.
  if (media.tvdbId && Number.isSafeInteger(media.tvdbId) && media.tvdbId > 0) return media.tvdbId;
  let metadata;
  try {
    metadata = await client.lookupMetadata?.({ tmdbId: media.tmdbId });
  } catch (err) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    throw new SeriesIdentityError('lookup-failed', `Service metadata lookup failed for TMDB ${media.tmdbId}`, status);
  }
  if (!metadata) throw new SeriesIdentityError('not-found', `No service series found for TMDB ${media.tmdbId}`);
  return rememberSeriesIdentity(media.tmdbId, metadata);
}
