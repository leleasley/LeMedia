import { selectedDmmService, sendToDmm } from './dmm.js';
import { isInMediaServerLibrary } from './mediaServerLibrary.js';
import { clearExclusion, findExclusion } from './arrExclusions.js';
import { createRequestVariantMatcher } from './requestVariants.js';
import { prisma } from '../utils/prisma.js';
import { getAppSettings } from '../utils/appSettings.js';
import { getArrClient, getArrClientForService, getServiceTypeForMedia, arrIdFieldForService, createServiceTagClient } from '../providers/index.js';
import type { ServiceTagClient } from '../providers/types.js';
import { getMovieDetails, getTvDetails } from './tmdb.js';
import { findTvPlaceholder, upgradeOrMergeTvPlaceholder } from './mediaService.js';
import { resolveServiceContext, type ServiceContext } from './requestRouting.js';
export { resolveServiceContext } from './requestRouting.js';
import { logEvent } from '../utils/logEvent.js';
import { VALID_MEDIA_TYPES } from '../utils/params.js';
import { ACTIVE_REQUEST_STATUSES, COMPLETABLE_REQUEST_STATUSES } from '@lemedia/shared';
import type { RequestStatusKind } from '@lemedia/shared';
import { safeNotify, safeUserNotify, buildSiteLink } from '../utils/safeNotify.js';
import { pluginEngine } from '../plugins/engine.js';
import type { ArrClient } from '../providers/types.js';
import { transitionRequestStatus } from './requestStatusTransition.js';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { trimTrailingSlashes } from '../utils/trimTrailingSlashes.js';
import { ADMIN_ROLE, checkRequestGuard, resolveRequestApproval, validateRequestCriteria } from './requestCreationPolicy.js';
import { validateSeasonSelection } from './seriesCatalog.js';
import { resolveSeriesIdentity, SeriesIdentityError } from './mediaIdentity.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Write transactions queue behind SQLite's single writer (connection_limit=1). Prisma's
 *  defaults (maxWait 2s / timeout 5s) are too tight for a burst of requests: the queue is serviced
 *  fine, but a slow head-of-line transaction would surface as a P1008 500. Give it real headroom
 *  so a burst waits instead of failing. */
const WRITE_TX = { maxWait: 10_000, timeout: 15_000 } as const;

export function validateRequestBody(body: { tmdbId: unknown; mediaType: unknown; seasons?: unknown }): {
  valid: true; tmdbId: number; mediaType: 'movie' | 'tv'; seasons: number[] | undefined;
} | { valid: false; error: string } {
  const { tmdbId, mediaType, seasons } = body;
  if (typeof tmdbId !== 'number' || !Number.isFinite(tmdbId) || tmdbId < 1) {
    return { valid: false, error: 'Invalid tmdbId' };
  }
  if (!VALID_MEDIA_TYPES.includes(mediaType as string)) {
    return { valid: false, error: 'mediaType must be "movie" or "tv"' };
  }
  if (seasons != null && (!Array.isArray(seasons) || !seasons.every(s => Number.isInteger(s) && s > 0))) {
    return { valid: false, error: 'Seasons must be positive integers' };
  }
  const validSeasons = Array.isArray(seasons) && seasons.length > 0 ? [...new Set(seasons as number[])] : undefined;
  return { valid: true, tmdbId, mediaType: mediaType as 'movie' | 'tv', seasons: validSeasons };
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------

export async function findOrCreateMedia(tmdbId: number, mediaType: 'movie' | 'tv') {
  const existing = await prisma.media.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
  });
  if (existing) return existing;

  const tmdbData = mediaType === 'movie'
    ? await getMovieDetails(tmdbId)
    : await getTvDetails(tmdbId);

  const title = 'title' in tmdbData ? tmdbData.title : tmdbData.name;
  const releaseDate = 'release_date' in tmdbData ? tmdbData.release_date : tmdbData.first_air_date;
  const tvdbId = mediaType === 'tv' ? (tmdbData.external_ids?.tvdb_id ?? null) : null;

  // TV: upgrade a placeholder (tmdbId<0) into the canonical row before creating a duplicate.
  if (mediaType === 'tv' && tvdbId) {
    const placeholder = await findTvPlaceholder(tvdbId);
    if (placeholder) {
      return upgradeOrMergeTvPlaceholder(placeholder, tmdbId, {
        tvdbId,
        title: placeholder.title || title,
        overview: placeholder.overview ?? (tmdbData.overview || null),
        posterPath: placeholder.posterPath ?? tmdbData.poster_path,
        backdropPath: placeholder.backdropPath ?? tmdbData.backdrop_path,
        releaseDate: placeholder.releaseDate ?? (releaseDate || null),
        voteAverage: placeholder.voteAverage ?? tmdbData.vote_average,
        genres: placeholder.genres ?? (tmdbData.genres ? JSON.stringify(tmdbData.genres.map((g) => g.name)) : null),
      });
    }
  }

  // Two users asking for the same trending title at the same moment both get here with nothing
  // in the table, and the second create trips the `(tmdbId, mediaType)` unique index — a raw
  // P2002 surfaced as a 500. The row the winner created is exactly what the loser wanted, so
  // take it and move on.
  const media = await prisma.$transaction(async (tx) => {
    const created = await tx.media.create({
      data: {
        tmdbId,
        tvdbId,
        mediaType,
        title,
        overview: tmdbData.overview || null,
        posterPath: tmdbData.poster_path,
        backdropPath: tmdbData.backdrop_path,
        releaseDate: releaseDate || null,
        voteAverage: tmdbData.vote_average,
        genres: tmdbData.genres ? JSON.stringify(tmdbData.genres.map(g => g.name)) : null,
      },
    });

    if (mediaType === 'tv' && 'seasons' in tmdbData && tmdbData.seasons) {
      await tx.season.createMany({
        data: tmdbData.seasons
          .filter(s => s.season_number > 0)
          .map(s => ({
            mediaId: created.id,
            seasonNumber: s.season_number,
            episodeCount: s.episode_count,
          })),
      });
    }

    return created;
  }, WRITE_TX).catch(async (err) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.media.findUnique({ where: { tmdbId_mediaType: { tmdbId, mediaType } } });
      if (winner) return winner;
    }
    throw err;
  });

  return media;
}

export async function isBlacklisted(tmdbId: number, mediaType: string): Promise<{ blacklisted: boolean; reason: string | null }> {
  const entry = await prisma.blacklistedMedia.findUnique({
    where: { tmdbId_mediaType: { tmdbId, mediaType } },
  });
  return { blacklisted: !!entry, reason: entry?.reason || null };
}

export async function getUserTagName(userId: number): Promise<string> {
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } });
  return dbUser?.displayName || dbUser?.email || `user-${userId}`;
}

// ---------------------------------------------------------------------------
// Service dispatch
// ---------------------------------------------------------------------------

/**
 * Root folders are instance-local, but a folder rule can set a path without pinning a service —
 * and a quality mapping may then redirect the request to a *different* instance. That combination
 * used to send instance A's path to instance B, where the *arr either rejects it or silently
 * creates an unmanaged directory outside the library.
 *
 * So the path is checked against what the target instance actually reports. A mismatch falls back
 * to that instance's own first root folder and says so, instead of writing somewhere nobody
 * manages. Comparison ignores a trailing slash, which *arr instances are inconsistent about.
 */
async function resolveRootFolder(
  client: { getRootFolders: () => Promise<{ path: string }[]>; defaultRootFolder: string },
  requested: string | null | undefined,
  ctx: ServiceContext,
): Promise<string> {
  let available: { path: string }[] = [];
  try {
    available = await client.getRootFolders();
  } catch {
    // Instance unreachable: trust the configured path rather than block the request outright.
    return requested || client.defaultRootFolder;
  }

  const strip = (p: string) => trimTrailingSlashes(p);
  if (requested) {
    const match = available.find((f) => strip(f.path) === strip(requested));
    if (match) return match.path;
    logEvent(
      'warn',
      'FolderRules',
      `Root folder "${requested}"${ctx.ruleMatch ? ` (rule "${ctx.ruleMatch.ruleName}")` : ''} is not configured on the target service`
      + `${ctx.targetService ? ` #${ctx.targetService.id}` : ''}; falling back to that instance's default.`,
    );
  }
  return available[0]?.path || client.defaultRootFolder;
}

/** Exported for tests only — sendToArrService is the sole production caller. */
export const resolveRootFolderForTest = resolveRootFolder;

/** Radarr/Sonarr reject an add with a path-validator 400 when the computed folder is
 *  already taken by another entry — typically a TMDB duplicate (same film under two ids)
 *  added outside LeMedia, so the external-id lookup missed it. Carries the occupant so the
 *  caller can adopt it (same id) or explain the conflict (different id) instead of logging
 *  a raw 500-char validation blob. */
export class ArrPathConflictError extends Error {
  constructor(
    public readonly occupantTitle: string,
    public readonly occupantExternalId: number | null,
    public readonly path: string,
  ) {
    super(`Path "${path}" is already used by "${occupantTitle}"`);
    this.name = 'ArrPathConflictError';
  }
}

/** True when `err` is a *arr add-time path collision (Radarr MoviePathValidator /
 *  Sonarr equivalent). Exported for tests. */
export function isPathConflictError(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 400) return false;
  const data = err.response.data;
  const raw = typeof data === 'string' ? data : JSON.stringify(data);
  return raw.includes('PathValidator') || raw.includes('already configured for an existing');
}

/** Resolve an add-time path conflict: adopt the occupant when it IS the requested title
 *  (same external id — triggers a search on it and returns its service id), else throw
 *  `ArrPathConflictError` naming the occupant. Rethrows the original error when it isn't
 *  a path conflict or the connector can't list paths. Exported for tests. */
export async function resolveAddConflict(
  client: ArrClient,
  err: unknown,
  requested: { title: string; externalId: number | null; rootFolderPath: string },
): Promise<number> {
  if (!isPathConflictError(err)) throw err;
  const finder = client.findByPath;
  if (typeof finder !== 'function') throw err;
  const occupant = await finder.call(client, requested.rootFolderPath).catch(() => null);
  if (!occupant) throw err;
  if (requested.externalId != null && occupant.externalId === requested.externalId) {
    await client.searchMedia(occupant.id);
    return occupant.id;
  }
  throw new ArrPathConflictError(occupant.title, occupant.externalId, requested.rootFolderPath);
}

async function sendToArrService(
  media: { tmdbId: number; tvdbId: number | null; title: string },
  mediaType: string,
  username: string,
  ctx: ServiceContext,
  seasons?: number[],
  rootFolderOverride?: string | null,
  seasonNumbering?: string | null,
): Promise<number | null> {
  const serviceType = getServiceTypeForMedia(mediaType);
  const client = ctx.targetService
    ? getArrClientForService(ctx.targetService.id, serviceType, ctx.targetService.config)
    : await getArrClient(serviceType);

  let externalId: number;
  try {
    externalId = mediaType === 'movie' ? media.tmdbId : await resolveSeriesIdentity(client, media);
  } catch (err) {
    // Do not include upstream URLs/errors: an Axios error may contain the instance API key.
    // The classified reason is ours, and names the one action that fixes each case.
    const instance = ctx.targetService ? ` on service #${ctx.targetService.id}` : '';
    const reason = err instanceof SeriesIdentityError ? err.reason : null;
    const detail = reason === 'not-found'
      ? 'this service has no series for that TMDB id (split shows are keyed under a different TVDB id) — link the correct series from the title page'
      : reason === 'lookup-failed'
        ? `the service metadata lookup failed${err instanceof SeriesIdentityError && err.upstreamStatus ? ` (HTTP ${err.upstreamStatus})` : ''}`
        : reason === 'conflict' || reason === 'invalid'
          ? 'the stored TVDB identity disagrees with the service — re-link the series from the title page'
          : 'check the service metadata lookup';
    throw new Error(`Cannot resolve ${mediaType} TMDB ${media.tmdbId} "${media.title}"${instance}: ${detail}`);
  }
  if (!externalId) throw new Error(`Missing external ID for ${mediaType} "${media.title}"`);
  if (mediaType === 'tv' && seasons?.length) {
    if (!seasonNumbering) throw new Error('Season numbering is unknown; select the seasons again from the service catalog');
    await validateSeasonSelection(client, externalId, seasons, seasonNumbering);
  }

  // Priority: explicit override > rule match > default folder > first root folder
  const requested = rootFolderOverride || ctx.ruleMatch?.folderPath || ctx.defaultFolder;
  const folderPath = await resolveRootFolder(client, requested, ctx);

  // Rule tags are instance-local and independent of optional requester tagging.
  const ruleTags = ctx.ruleMatch?.tagIds ?? [];
  let tagClient: ServiceTagClient | undefined;
  if (ruleTags.length > 0) {
    if (!ctx.targetService || ctx.ruleMatch?.serviceId !== ctx.targetService.id) {
      throw new Error('RULE_TAGS_REQUIRE_SERVICE');
    }
    tagClient = createServiceTagClient(serviceType, ctx.targetService.config);
    const knownIds = new Set((await tagClient.getTags()).map(tag => tag.id));
    if (ruleTags.some(id => !knownIds.has(id))) throw new Error('RULE_TAGS_NOT_FOUND');
  }
  const settings = await getAppSettings();
  const userTags = settings?.arrUserTaggingEnabled ? [await client.getOrCreateTag(username)] : [];
  const tags = [...new Set([...ruleTags, ...userTags])];

  const existing = await client.findByExternalId(externalId);
  if (existing) {
    if (tagClient) await tagClient.addTagsToMedia(existing.id, ruleTags);
    if (mediaType === 'tv' && seasons?.length) {
      if (!client.requestSeasons) throw new Error('This service does not support season requests');
      await client.requestSeasons(existing.id, seasons);
    } else if (mediaType === 'tv' && client.requestAllSeasons) {
      await client.requestAllSeasons(existing.id);
    } else {
      await client.searchMedia(existing.id);
    }
    return existing.id;
  }

  const profileId = ctx.targetProfileId ?? ctx.defaultProfileId
    ?? (await client.getQualityProfiles())[0]?.id ?? 1;

  // A path collision (TMDB duplicate sitting at the computed folder) rejects the add
  // with a validator 400. resolveAddConflict adopts the occupant when it is the same
  // title (returns its service id, claimed by the caller below) or throws a named
  // conflict; anything else rethrows unchanged.
  // Reaching here means the request was approved (auto or by an admin). An import-list exclusion
  // is the service's "never add this again"; an approval is the explicit decision to overturn it.
  await clearExclusion(client, mediaType, media.tmdbId, mediaType === 'tv' ? externalId : null).catch((err) => {
    logEvent('warn', 'Request', `Could not clear an import-list exclusion for "${media.title}": ${String(err)}`);
  });

  const adoptedId: number | null = await client.addMedia({
    title: media.title,
    externalId: externalId ?? (0 as unknown as number),
    qualityProfileId: profileId,
    rootFolderPath: folderPath,
    tags,
    seasons,
    seriesType: ctx.ruleMatch?.seriesType as string | undefined,
  }).then(
    () => null,
    (err: unknown) => resolveAddConflict(
      client, err, { title: media.title, externalId, rootFolderPath: folderPath },
    ),
  );
  if (adoptedId !== null) return adoptedId;
  // addMedia returns void, so look the fresh record up by its external id (one call) and claim
  // it now. Without this the id stayed null until the next *arr sync (up to 30 min), and
  // anything keyed on it — the zurg watcher matching a finished grab — could not find the title.
  // Best-effort: on failure the caller nulls it and the next sync claims it, as before.
  if (externalId) {
    const found = await client.findByExternalId(externalId).catch(() => null);
    if (found?.id) return found.id;
  }
  return null;
}

/** Outcome of a dispatch to the *arr.
 *  - `sent`      : the *arr accepted it (search started).
 *  - `failed`    : transient failure — worth retrying later.
 *  - `conflict`  : permanent failure (the *arr holds a different title at the target folder);
 *                   retrying can never succeed, so the request must NOT be re-dispatched. */
export type SendOutcome = 'sent' | 'failed' | 'conflict';

export async function sendToService(
  media: { tmdbId: number; tvdbId: number | null; title: string },
  mediaType: string,
  username: string,
  userId: number | null = null,
  seasons?: number[],
  qualityOptionId?: number,
  rootFolderOverride?: string | null,
  /** Last, so the three callers that have no criteria to pass stay untouched. */
  criterionValueIds: number[] = [],
  seasonNumbering?: string | null,
  targetDmmServiceId?: number | null,
): Promise<SendOutcome> {
  try {
    if (targetDmmServiceId) {
      if (qualityOptionId || rootFolderOverride || criterionValueIds.length) throw new Error('DMM does not support quality, folder or routing criteria');
      if (mediaType !== 'movie' && mediaType !== 'tv') throw new Error('Unsupported DMM media type');
      await sendToDmm(targetDmmServiceId, mediaType, media.tmdbId, seasons, seasonNumbering);
      return 'sent';
    }
    const ctx = await resolveServiceContext(mediaType as 'movie' | 'tv', media.tmdbId, userId, qualityOptionId, criterionValueIds);

    const arrMediaId = await sendToArrService(media, mediaType, username, ctx, seasons, rootFolderOverride, seasonNumbering);

    // Claim the row now; otherwise ownership only lands at the next sync pass. serviceId and the
    // *arr id must move together — a serviceId pointing at B next to an id issued by A resolves to
    // a different title. When the id is unknown, null it so refreshMediaCategory re-resolves it
    // against the right instance.
    const arrIdField = arrIdFieldForService(getServiceTypeForMedia(mediaType));
    if (ctx.targetService && arrIdField) {
      await prisma.media.updateMany({
        where: { tmdbId: media.tmdbId, mediaType },
        data: { serviceId: ctx.targetService.id, [arrIdField]: arrMediaId },
      }).catch((err) => logEvent('debug', 'Request', `Failed to stamp serviceId on "${media.title}": ${err}`));
    }
    return 'sent';
  } catch (err) {
    // A path conflict already names the occupant — log the actionable sentence, not the
    // 500-char validator blob. Retrying can't help until the duplicate is resolved in
    // the *arr, so say so.
    if (err instanceof ArrPathConflictError) {
      const serviceType = getServiceTypeForMedia(mediaType);
      const occupant = err.occupantExternalId
        ? `"${err.occupantTitle}" (tmdbId ${err.occupantExternalId})`
        : `"${err.occupantTitle}"`;
      logEvent('error', 'Request',
        `Cannot add "${media.title}" to ${serviceType}: folder "${err.path}" is already used by ${occupant}. `
        + `Likely a duplicate TMDB entry, remove or merge the duplicate in ${serviceType}, then retry the request.`);
      // Permanent: the *arr already holds a different title at that folder, so every retry would
      // fail the same way and re-spam the log. The caller marks the request `conflict`
      // (terminal, excluded from the retry job) instead of `failed`.
      return 'conflict';
    }
    // Include the *arr's own validation body when present: a bare "status code 400"
    // (as one Sonarr series add produced) is undiagnosable from the event log alone.
    // Truncated — error bodies can echo the rejected payload back.
    let detail = String(err);
    if (axios.isAxiosError(err) && err.response) {
      const raw = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
      if (raw) detail += ` :: HTTP ${err.response.status} ${raw.slice(0, 500)}`;
    }
    logEvent('debug', 'Request', `Failed to send ${mediaType} "${media.title}" to service: ${detail}`);
    logEvent('error', 'Request', `Failed to send "${media.title}" to ${targetDmmServiceId ? 'DMM' : getServiceTypeForMedia(mediaType)}: ${detail}`);
    return 'failed';
  }
}

// ---------------------------------------------------------------------------
// Create-request pipeline (shared by POST /api/requests and ctx.requests.create)
// ---------------------------------------------------------------------------

/** Internal sentinel — bubbles through the dedup-then-create transaction so the caller can
 *  surface a 409 without throwing past the boundary. */
class DuplicateRequestError extends Error {}

/** Tagged union describing every way a request-create attempt can fail. The HTTP layer maps
 *  each `status` to its response code; the plugin context just exposes `{ ok, code, error }`.
 *  Extending with a new failure mode means adding one variant + its mapping — callers stay
 *  exhaustive via the discriminant. */
export type CreateRequestResult =
  | { ok: true; status: 201 | 202; request: Awaited<ReturnType<typeof prisma.mediaRequest.create>>; sendFailed?: boolean;
      /** Where it was sent (or will be, once approved): DMM's wanted list or an *arr. */
      destination: 'dmm' | 'radarr' | 'sonarr' }
  | { ok: false; status: 400; code: 'INVALID_INPUT'; error: string }
  | { ok: false; status: 403; code: 'BLOCKED_BY_GUARD'; error: string }
  | { ok: false; status: 403; code: 'BLACKLISTED'; error: string }
  | { ok: false; status: 409; code: 'DUPLICATE'; error: string }
  | { ok: false; status: 403; code: 'QUALITY_NOT_ALLOWED'; error: string }
  | { ok: false; status: 400; code: 'UNKNOWN_CRITERION_VALUE'; error: string }
  | { ok: false; status: 400; code: 'CRITERION_CONFLICT'; error: string }
  | { ok: false; status: 403; code: 'REQUESTS_DISABLED'; error: string };

export interface CreateRequestInput {
  userId: number;
  tmdbId: unknown;
  mediaType: unknown;
  seasons?: unknown;
  seasonNumbering?: unknown;
  rootFolder?: string;
  qualityOptionId?: number;
  /** One value per admin-defined criterion the requester picked. Order is irrelevant. */
  criterionValueIds?: number[];
  /** When true, the pluginGuard pass is skipped even for non-admins. Used by
   *  `ctx.requests.create` when the plugin author explicitly wants to avoid triggering other
   *  plugins' `request.create` guards (which could loop if the calling plugin is itself a
   *  guard owner). Defaults to false — HTTP route always runs guards for non-admins. */
  skipPluginGuard?: boolean;
}

/** Unified create-request pipeline: validation → pluginGuard → blacklist → findOrCreateMedia
 *  → dedup → quality gate → row create → sendToService (if autoApproved) → status flip →
 *  safeNotify / safeUserNotify / logEvent. Shared by the HTTP handler and the plugin context
 *  so the two paths cannot drift. */
export async function createUserRequest(input: CreateRequestInput): Promise<CreateRequestResult> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, role: true, displayName: true },
  });
  if (!user) {
    return { ok: false, status: 400, code: 'INVALID_INPUT', error: `User ${input.userId} not found` };
  }

  // `requestsEnabled` used to live in the frontend alone — the nav entry and the route were
  // hidden, but POST /api/requests kept working for anyone who called it directly. It gates the
  // whole pipeline now, admins and plugin `ctx.requests.create` included: "requests are off"
  // has to mean one thing, and an admin who wants one flips the toggle back.
  if ((await getAppSettings())?.requestsEnabled === false) {
    return { ok: false, status: 403, code: 'REQUESTS_DISABLED', error: 'The request system is disabled.' };
  }

  const validation = validateRequestBody({ tmdbId: input.tmdbId, mediaType: input.mediaType, seasons: input.seasons });
  if (!validation.valid) {
    return { ok: false, status: 400, code: 'INVALID_INPUT', error: validation.error };
  }
  const { tmdbId, mediaType, seasons: validSeasons } = validation;
  if (input.seasonNumbering != null && (typeof input.seasonNumbering !== 'string'
    || !/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]{1,40}$/.test(input.seasonNumbering)
    || mediaType !== 'tv' || !validSeasons?.length)) {
    return { ok: false, status: 400, code: 'INVALID_INPUT', error: 'Invalid season numbering' };
  }
  const seasonNumbering = typeof input.seasonNumbering === 'string' ? input.seasonNumbering : null;

  const guardError = await checkRequestGuard({
    userId: user.id, role: user.role, skipPluginGuard: input.skipPluginGuard,
    tmdbId, mediaType, seasons: validSeasons,
  });
  if (guardError) return guardError;

  const bl = await isBlacklisted(tmdbId, mediaType);
  if (bl.blacklisted) {
    return { ok: false, status: 403, code: 'BLACKLISTED', error: bl.reason || 'This media has been blocked by an administrator.' };
  }

  const targetDmm = await selectedDmmService();
  if (targetDmm && (input.qualityOptionId || input.rootFolder || input.criterionValueIds?.length)) {
    return { ok: false, status: 400, code: 'INVALID_INPUT', error: 'DMM does not support LeMedia quality, folder or routing criteria' };
  }
  const media = await findOrCreateMedia(tmdbId, mediaType);
  // Without Radarr/Sonarr there is no synced row to say "you already have this"; the media
  // server scan answers it instead, so a DMM user doesn't request something they can watch.
  if (isInMediaServerLibrary(mediaType, tmdbId, media.tvdbId)) {
    return { ok: false, status: 409, code: 'DUPLICATE', error: 'This title is already in your library' };
  }

  const settings = await getAppSettings();
  const approval = await resolveRequestApproval(user.role, settings?.autoApproveRequests ?? false, input.qualityOptionId);
  if (!approval.ok) return approval;
  // An import-list exclusion would make the service reject the add, so the request is held for an
  // admin even when auto-approve is on. Approving it removes the exclusion (see sendToArrService).
  const exclusion = targetDmm ? null : await findExclusion(mediaType, tmdbId, media.tvdbId);
  const excluded = !!exclusion;
  // An admin is the approver, so their own request goes through; a normal user's waits for one.
  const shouldAutoApprove = approval.autoApprove && (!excluded || user.role === ADMIN_ROLE);

  // Criterion values, checked before anything is written. Two guards, both about a request that
  // could never be served: an id that does not exist, and two values of the same criterion — a
  // title cannot be wanted in French *and* subtitled at once, and a folder rule matching on that
  // criterion would have to pick one arbitrarily.
  const criterionValueIds = [...new Set(input.criterionValueIds ?? [])];
  const criteriaError = await validateRequestCriteria(criterionValueIds);
  if (criteriaError) return criteriaError;

  const matchesVariant = await createRequestVariantMatcher(input,
    option => resolveServiceContext(mediaType, tmdbId, user.id, option, criterionValueIds));

  // Dedup + create in one transaction so two concurrent calls by the same user can't both pass
  // the dedup check and both insert (SQLite serializes writes, but defensive against future
  // backends and intent-clarity for the reader).
  const initialStatus: RequestStatusKind = shouldAutoApprove ? 'approved' : 'pending';
  const mediaRequest = await prisma.$transaction(async (tx) => {
    // Compare one user's active requests for this title. Quality labels may be aliases, but
    // different folders, routing actions, criteria or disjoint season scopes remain distinct.
    // Routing is resolved above, keeping external lookups outside the write transaction.
    const candidates = await tx.mediaRequest.findMany({
      where: {
        mediaId: media.id,
        userId: user.id,
        status: { in: [...ACTIVE_REQUEST_STATUSES] },
      },
      select: { id: true, qualityOptionId: true, rootFolder: true, seasons: true, seasonNumbering: true, criteria: { select: { valueId: true } } },
    });
    const wanted = new Set(criterionValueIds);
    const dup = candidates.find((c) => {
      if (!matchesVariant(c)) return false;
      // A new whole-series request extends an existing season-only request. Unknown or
      // malformed legacy scopes remain conservative to avoid creating duplicate requests.
      if (mediaType === 'tv' && !validSeasons?.length && c.seasons) {
        try {
          const existing: unknown = JSON.parse(c.seasons);
          if (Array.isArray(existing) && existing.length > 0 && existing.every(s => Number.isInteger(s) && s > 0)) return false;
        } catch { /* Treat invalid legacy data as a whole-series request. */ }
      }
      // Different seasons of the same variant are separate requests.
      if (mediaType === 'tv' && validSeasons?.length && c.seasons) {
        if (c.seasonNumbering !== seasonNumbering) return false;
        try {
          const existingSeasons: unknown = JSON.parse(c.seasons);
          if (Array.isArray(existingSeasons) && existingSeasons.length > 0
            && existingSeasons.every(s => Number.isInteger(s) && s > 0)
            && !existingSeasons.some(s => validSeasons.includes(s))) return false;
        } catch { /* Treat invalid legacy data as a whole-series request. */ }
      }
      if (c.criteria.length !== wanted.size) return false;
      return c.criteria.every((row) => wanted.has(row.valueId));
    });
    if (dup) throw new DuplicateRequestError();
    return transitionRequestStatus(
      { requestId: undefined, from: undefined, to: initialStatus, why: shouldAutoApprove ? 'user-request-create-auto-approve' : 'user-request-create' },
      () => tx.mediaRequest.create({
        data: {
          mediaId: media.id,
          userId: user.id,
          mediaType,
          seasons: validSeasons ? JSON.stringify(validSeasons) : null,
          seasonNumbering,
          targetDmmServiceId: targetDmm?.id ?? null,
          excluded,
          rootFolder: typeof input.rootFolder === 'string' ? input.rootFolder : null,
          qualityOptionId: input.qualityOptionId ?? null,
          status: initialStatus,
          approvedById: shouldAutoApprove ? user.id : null,
          criteria: criterionValueIds.length > 0
            ? { create: criterionValueIds.map((valueId) => ({ valueId })) }
            : undefined,
        },
        include: { media: true, user: { select: { id: true, displayName: true, avatar: true } } },
      }),
    );
  }, WRITE_TX).catch((err) => {
    if (err instanceof DuplicateRequestError) return null;
    throw err;
  });
  if (!mediaRequest) {
    return { ok: false, status: 409, code: 'DUPLICATE', error: 'You already have an active request for this media' };
  }

  let sendFailed = false;
  if (shouldAutoApprove) {
    const tagName = await getUserTagName(user.id);
    const outcome = await sendToService(media, mediaType, tagName, user.id, validSeasons, input.qualityOptionId, undefined, criterionValueIds, seasonNumbering, targetDmm?.id);

    await recordRequestDispatch(outcome, media, mediaRequest);
    sendFailed = outcome !== 'sent';
  }

  const username = user.displayName || 'User';
  const mediaUrl = await buildSiteLink(`/${mediaType}/${media.tmdbId}`);
  safeNotify('request_new', { title: media.title, mediaType, username, posterPath: media.posterPath, tmdbId: media.tmdbId, url: mediaUrl });

  // Auto-approve path: don't ping the requester — they already know the instance auto-approves
  // (their request goes through silently). The bell entry would just be noise. Manual approvals
  // emit the notif from lifecycle.ts where a human decision actually happened.
  //
  // Pending path: admins need an in-app heads-up so they don't have to check the admin tab
  // manually. We notify every (non-disabled) admin user. Custom mod roles aren't covered yet —
  // follow-up if instances need it.
  if (!shouldAutoApprove) {
    const admins = await prisma.user.findMany({
      where: { role: 'admin', disabled: false, id: { not: user.id } },
      select: { id: true },
    });
    for (const admin of admins) {
      safeUserNotify(admin.id, {
        type: 'request_pending_review',
        title: 'notifications.msg.request_pending_review_title',
        message: 'notifications.msg.request_pending_review',
        metadata: { mediaId: media.id, tmdbId: media.tmdbId, mediaType, requestId: mediaRequest.id, msgParams: { username, title: media.title } },
      });
    }
  }
  logEvent('info', 'Request', `${username} requested "${media.title}"`);

  // Where this request is headed, so the UI can name the destination instead of saying
  // "request sent" and leaving people to guess between DMM's wanted list and the *arrs.
  const destination = targetDmm ? 'dmm' as const : getServiceTypeForMedia(mediaType) as 'radarr' | 'sonarr';

  return sendFailed
    ? { ok: true, status: 202, request: mediaRequest, sendFailed: true, destination }
    : { ok: true, status: 201, request: mediaRequest, destination };
}

async function recordRequestDispatch(
  outcome: SendOutcome,
  media: { id: number; statusCategory: string },
  request: { id: number; status: string },
): Promise<void> {
  if (outcome !== 'sent') {
    // `conflict` is terminal (the *arr holds a different title at the target folder) and is
    // excluded from the retry job; `failed` stays retryable.
    const nextStatus: RequestStatusKind = outcome === 'conflict' ? 'conflict' : 'failed';
    await transitionRequestStatus(
      { requestId: request.id, from: request.status as RequestStatusKind, to: nextStatus, why: outcome === 'conflict' ? 'dispatch-conflict' : 'dispatch-failed' },
      () => prisma.mediaRequest.update({ where: { id: request.id }, data: { status: nextStatus } }),
    ).catch((err) => logEvent('warn', 'Request', `Failed to mark request ${request.id} as ${nextStatus} after sendToService rejected: ${String(err)}`));
    return;
  }
  if (media.statusCategory === 'AVAILABLE' || media.statusCategory === 'PROCESSING') return;
  await prisma.media.update({
    where: { id: media.id },
    data: { statusCategory: 'SEARCHING' },
  }).catch((err) => {
    logEvent('warn', 'Request', `Status-flip to 'searching' failed for media ${media.id} (request ${request.id}): ${String(err)}`);
  });
}

// ---------------------------------------------------------------------------
// Collection requests
// ---------------------------------------------------------------------------

export async function requestCollectionMovie(
  movieTmdbId: number,
  user: { id: number; role: string },
): Promise<boolean> {
  const settings = await getAppSettings();
  if (settings?.requestsEnabled === false) return false;

  const bl = await isBlacklisted(movieTmdbId, 'movie');
  if (bl.blacklisted) return false;

  const existingRequest = await prisma.mediaRequest.findFirst({
    where: {
      media: { tmdbId: movieTmdbId, mediaType: 'movie' },
      status: { in: [...ACTIVE_REQUEST_STATUSES, 'available'] },
    },
  });
  if (existingRequest) return false;

  const dbMedia = await prisma.media.findUnique({
    where: { tmdbId_mediaType: { tmdbId: movieTmdbId, mediaType: 'movie' } },
  });
  if (dbMedia?.statusCategory === 'AVAILABLE') return false;
  // Same check as a single request: the media server may hold it without a synced row.
  if (isInMediaServerLibrary('movie', movieTmdbId, null)) return false;

  const media = dbMedia ?? await findOrCreateMedia(movieTmdbId, 'movie');
  const targetDmm = await selectedDmmService();

  // Collections use the same default approval policy as individual movie requests, and the
  // same exclusion hold: an excluded film is never auto-approved, whatever the policy says.
  const exclusion = targetDmm ? null : await findExclusion('movie', movieTmdbId, media.tvdbId);
  const excluded = !!exclusion;
  const approval = await resolveRequestApproval(user.role, settings?.autoApproveRequests ?? false);
  if (!approval.ok) return false;
  const autoApprove = approval.autoApprove && (!excluded || user.role === ADMIN_ROLE);
  const collectionInitialStatus: RequestStatusKind = autoApprove ? 'approved' : 'pending';
  const req = await transitionRequestStatus(
    { requestId: undefined, from: undefined, to: collectionInitialStatus, why: autoApprove ? 'collection-request-auto-approve' : 'collection-request-create' },
    () => prisma.mediaRequest.create({
      data: {
        mediaId: media.id,
        userId: user.id,
        mediaType: 'movie',
        targetDmmServiceId: targetDmm?.id ?? null,
        status: collectionInitialStatus,
        excluded,
        approvedById: autoApprove ? user.id : null,
      },
    }),
  );

  if (autoApprove) {
    const tagName = await getUserTagName(user.id);
    const outcome = await sendToService(media, 'movie', tagName, user.id, undefined, undefined, undefined, [], null, targetDmm?.id);
    if (outcome !== 'sent') {
      const nextStatus: RequestStatusKind = outcome === 'conflict' ? 'conflict' : 'failed';
      await transitionRequestStatus(
        { requestId: req.id, from: collectionInitialStatus, to: nextStatus, why: outcome === 'conflict' ? 'dispatch-conflict' : 'dispatch-failed' },
        () => prisma.mediaRequest.update({ where: { id: req.id }, data: { status: nextStatus } }),
      );
    }
  }

  return true;
}

// ---------------------------------------------------------------------------
// Status promotion (moved from GET /requests handler)
// ---------------------------------------------------------------------------

export async function promoteStaleStatuses(): Promise<void> {
  // Best-effort: this runs on the GET /api/requests read path, so a transient DB
  // timeout (e.g. SQLite lock contention during a sync right after boot — P1008)
  // must never 500 the list. Promotion retries on the next read / scheduler tick.
  try {
    await transitionRequestStatus(
      { requestId: undefined, from: undefined, to: 'available', why: 'cascade-media-available' },
      () => prisma.mediaRequest.updateMany({
        where: {
          status: { in: [...COMPLETABLE_REQUEST_STATUSES] },
          media: { statusCategory: 'AVAILABLE' },
        },
        data: { status: 'available' },
      }),
    );
  } catch (err) {
    logEvent('warn', 'Request', `Status promotion skipped (transient DB error): ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`)
      .catch(() => { /* logging must never break the read path either */ });
  }
}

// ---------------------------------------------------------------------------
// Retry failed requests (called by scheduler)
// ---------------------------------------------------------------------------

export async function retryFailedRequests(): Promise<{ retried: number; succeeded: number }> {
  const failed = await prisma.mediaRequest.findMany({
    where: { status: 'failed' },
    include: {
      media: true,
      user: { select: { id: true, displayName: true, email: true } },
      // Without these a retry would route on quality alone and land in the wrong folder.
      criteria: { select: { valueId: true } },
    },
  });

  if (failed.length === 0) return { retried: 0, succeeded: 0 };

  let succeeded = 0;
  for (const req of failed) {
    const tagName = req.user.displayName || req.user.email || `user-${req.userId}`;
    const seasons = req.seasons ? JSON.parse(req.seasons) : undefined;
    const outcome = await sendToService(
      req.media, req.mediaType, tagName, req.userId, seasons, req.qualityOptionId ?? undefined,
      undefined, req.criteria?.map((c) => c.valueId) ?? [], req.seasonNumbering, req.targetDmmServiceId,
    );
    if (outcome === 'sent') {
      await transitionRequestStatus(
        { requestId: req.id, from: req.status as RequestStatusKind, to: 'approved', why: 'scheduler-retry' },
        () => prisma.mediaRequest.update({ where: { id: req.id }, data: { status: 'approved' } }),
      );
      succeeded++;
    } else if (outcome === 'conflict') {
      // Permanent — the *arr holds a different title at the target folder. Mark it terminal so
      // this job stops re-dispatching it every cycle (which only re-spammed the log).
      await transitionRequestStatus(
        { requestId: req.id, from: req.status as RequestStatusKind, to: 'conflict', why: 'dispatch-conflict' },
        () => prisma.mediaRequest.update({ where: { id: req.id }, data: { status: 'conflict' } }),
      );
    }
  }

  if (succeeded > 0) {
    logEvent('info', 'Request', `${succeeded}/${failed.length} failed requests retried successfully`);
  }

  return { retried: failed.length, succeeded };
}
