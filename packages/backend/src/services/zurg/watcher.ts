import { COMPLETABLE_REQUEST_STATUSES } from '@lemedia/shared';
import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';
import { promoteMediaToAvailable } from '../mediaService.js';
import { findAvailabilityRecipients, sendAvailabilityNotifications } from '../sync/helpers.js';
import { safeUserNotify, getInstanceLocale } from '../../utils/safeNotify.js';
import { sendPushToUsers } from '../pushService.js';
import { renderNotificationTemplate } from '@lemedia/shared';
import {
  getZurgConn, getZurgStatus, zurgPlacedExists, parseJobTarget,
  type ZurgConn, type ZurgJob, type ZurgStatus,
} from './client.js';

/**
 * Zurg → LeMedia availability.
 *
 * Zurg's acquisition places a release inside `__magic__` and asks Radarr/Sonarr to rescan, but
 * that rescan often imports nothing (stale listing, upstream zurg#256) and a rescan import never
 * fires the *arr "download" webhook anyway — so titles sat on "Searching" until a later sync.
 * The library is fed to rex straight from zurg, so a placed release is already watchable.
 *
 * This watcher reads zurg's acquisition snapshot (every 30 s, or at once when zurg pings
 * POST /api/webhooks/zurg), confirms each newly *done* job's placement still exists with one
 * depth-0 PROPFIND, and promotes the matching LeMedia title — firing the normal notifications.
 */

const POLL_MS = 30_000;
/** Upper bound on placement checks per run, so a first run over a large backlog stays gentle. */
const MAX_CHECKS_PER_RUN = 25;
/** A placement reported missing is not asked about again for this long. */
const MISSING_BACKOFF_MS = 10 * 60_000;

interface Snapshot {
  fetchedAt: Date;
  status: ZurgStatus;
  serviceName: string;
}

let snapshot: Snapshot | null = null;
let lastError: string | null = null;
let running: Promise<ZurgSyncResult> | null = null;
let rerunRequested = false;
let timer: NodeJS.Timeout | null = null;

/** Job key → updated_at already confirmed, so an unchanged done job is never re-checked. */
const confirmed = new Map<string, string>();
const missingUntil = new Map<string, number>();
/** Previous state per job, to alert on transitions seen while running (never on boot). */
const previous = new Map<string, { state: string; attempts: number }>();
/** Attempts after which a still-retrying requested title is worth telling the requester about. */
const STALL_ATTEMPTS = 5;
/** Zurg's reason when a title was simply dropped from Radarr/Sonarr — not a failure. */
const REMOVED_DETAIL = /no longer on the source/i;

export interface ZurgSyncResult { checked: number; promoted: number; skipped?: string }

const jobKey = (j: ZurgJob) => `${j.source}|${j.id}`;

export function getZurgSnapshot(): { fetchedAt: Date | null; status: ZurgStatus | null; serviceName: string | null; error: string | null } {
  return { fetchedAt: snapshot?.fetchedAt ?? null, status: snapshot?.status ?? null, serviceName: snapshot?.serviceName ?? null, error: lastError };
}

/** Zurg jobs for one LeMedia title (movie → Radarr id, series → Sonarr id, all seasons). */
export function getZurgJobsFor(media: { mediaType: string; radarrId: number | null; sonarrId: number | null }): ZurgJob[] {
  const jobs = snapshot?.status.jobs ?? [];
  return jobs.filter((j) => {
    const t = parseJobTarget(j);
    if (!t) return false;
    if (t.kind === 'movie') return media.mediaType === 'movie' && media.radarrId === t.radarrId;
    return media.mediaType === 'tv' && media.sonarrId === t.sonarrId;
  });
}

/** Run one pass now. Concurrent callers share the in-flight pass; a call during a pass queues
 *  exactly one follow-up so a webhook ping is never lost. */
export function runZurgSync(reason: string): Promise<ZurgSyncResult> {
  if (running) {
    rerunRequested = true;
    return running;
  }
  running = (async () => {
    try {
      let result = await syncOnce(reason);
      while (rerunRequested) {
        rerunRequested = false;
        result = await syncOnce(`${reason}+rerun`);
      }
      return result;
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce(reason: string): Promise<ZurgSyncResult> {
  const conn = await getZurgConn();
  if (!conn) {
    snapshot = null;
    lastError = null;
    return { checked: 0, promoted: 0, skipped: 'not-configured' };
  }

  let status: ZurgStatus;
  try {
    status = await getZurgStatus(conn);
    snapshot = { fetchedAt: new Date(), status, serviceName: conn.name };
    lastError = null;
  } catch (err) {
    lastError = String((err as Error)?.message ?? err).slice(0, 200);
    logEvent('debug', 'Zurg', `status fetch failed (${reason}): ${lastError}`);
    return { checked: 0, promoted: 0, skipped: 'unreachable' };
  }

  await alertOnStalls(status.jobs ?? []).catch((err) => logEvent('debug', 'Zurg', `stall alerts failed: ${String(err)}`));

  const done = (status.jobs ?? []).filter((j) => j.state === 'done' && !!j.placed && !!parseJobTarget(j));
  if (done.length === 0) return { checked: 0, promoted: 0 };

  const radarrIds = new Set<number>();
  const sonarrIds = new Set<number>();
  for (const j of done) {
    const t = parseJobTarget(j)!;
    if (t.kind === 'movie') radarrIds.add(t.radarrId);
    else sonarrIds.add(t.sonarrId);
  }
  const media = await prisma.media.findMany({
    where: {
      OR: [
        { mediaType: 'movie', radarrId: { in: [...radarrIds] } },
        { mediaType: 'tv', sonarrId: { in: [...sonarrIds] } },
      ],
    },
    select: {
      id: true, mediaType: true, title: true, posterPath: true, tmdbId: true, statusCategory: true,
      availableAt: true, radarrId: true, sonarrId: true,
      seasons: { select: { seasonNumber: true, statusCategory: true, episodeCount: true } },
    },
  });
  const movieByRadarr = new Map(media.filter((m) => m.mediaType === 'movie' && m.radarrId).map((m) => [m.radarrId!, m]));
  const showBySonarr = new Map(media.filter((m) => m.mediaType === 'tv' && m.sonarrId).map((m) => [m.sonarrId!, m]));

  const now = Date.now();
  let checked = 0;
  let promoted = 0;

  for (const job of done) {
    if (checked >= MAX_CHECKS_PER_RUN) break;
    const key = jobKey(job);
    if (confirmed.get(key) === (job.updated_at ?? '')) continue;
    if ((missingUntil.get(key) ?? 0) > now) continue;

    const target = parseJobTarget(job)!;
    const m = target.kind === 'movie' ? movieByRadarr.get(target.radarrId) : showBySonarr.get(target.sonarrId);
    if (!m) continue; // zurg is working on something LeMedia doesn't track

    // Nothing to do when LeMedia already shows it as available.
    if (target.kind === 'movie' && m.statusCategory === 'AVAILABLE') { confirmed.set(key, job.updated_at ?? ''); continue; }
    if (target.kind === 'tv') {
      const season = m.seasons.find((s) => s.seasonNumber === target.season);
      if (season?.statusCategory === 'AVAILABLE' && m.statusCategory === 'AVAILABLE') { confirmed.set(key, job.updated_at ?? ''); continue; }
    }

    checked++;
    const exists = await zurgPlacedExists(conn, job.placed!);
    if (exists === null) break; // zurg stopped answering, try again next pass
    if (!exists) {
      missingUntil.set(key, now + MISSING_BACKOFF_MS);
      continue;
    }

    try {
      const changed = target.kind === 'movie'
        ? await promoteMovie(m, job)
        : await promoteSeason(m, job, target.season, target.firstEp, target.lastEp);
      if (changed) promoted++;
      confirmed.set(key, job.updated_at ?? '');
    } catch (err) {
      logEvent('warn', 'Zurg', `promote failed for "${m.title}": ${String(err)}`);
    }
  }

  if (promoted > 0) logEvent('info', 'Zurg', `Marked ${promoted} title(s) available from zurg placements (${reason})`);
  return { checked, promoted };
}

type MediaRow = {
  id: number; mediaType: string; title: string; posterPath: string | null; tmdbId: number;
  statusCategory: string; availableAt: Date | null;
  seasons: { seasonNumber: number; statusCategory: string; episodeCount: number }[];
};

async function promoteMovie(m: MediaRow, job: ZurgJob): Promise<boolean> {
  const recipients = await findAvailabilityRecipients(m.id);
  await promoteMediaToAvailable(m.id, !!m.availableAt);
  sendAvailabilityNotifications(m.title, 'movie', m.posterPath, m.id, m.tmdbId, recipients);
  logEvent('info', 'Zurg', `"${m.title}" is available, placed by zurg${job.release ? ` (${job.release})` : ''}`);
  return true;
}

async function promoteSeason(
  m: MediaRow, job: ZurgJob, seasonNumber: number, firstEp: number | null, lastEp: number | null,
): Promise<boolean> {
  const season = m.seasons.find((s) => s.seasonNumber === seasonNumber);
  // A job covering only part of a known season (an ongoing season, a single episode) is not the
  // whole season — leave that to the regular sync rather than overstating availability.
  const covered = firstEp !== null && lastEp !== null ? lastEp - firstEp + 1 : null;
  if (season && season.episodeCount > 0 && covered !== null && (firstEp !== 1 || covered < season.episodeCount)) {
    return false;
  }

  let changed = false;
  if (season?.statusCategory !== 'AVAILABLE') {
    await prisma.season.upsert({
      where: { mediaId_seasonNumber: { mediaId: m.id, seasonNumber } },
      update: { statusCategory: 'AVAILABLE' },
      create: { mediaId: m.id, seasonNumber, episodeCount: covered ?? 0, statusCategory: 'AVAILABLE' },
    });
    changed = true;
    logEvent('info', 'Zurg', `"${m.title}" season ${seasonNumber} is available, placed by zurg${job.release ? ` (${job.release})` : ''}`);
  }

  if (m.statusCategory === 'AVAILABLE') return changed;

  // Promote the series once every season someone asked for is in. A request without a season
  // list means "all seasons" (specials excluded).
  const [open, seasons] = await Promise.all([
    prisma.mediaRequest.findMany({
      where: { mediaId: m.id, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
      select: { seasons: true },
    }),
    prisma.season.findMany({ where: { mediaId: m.id }, select: { seasonNumber: true, statusCategory: true } }),
  ]);
  const availableSeasons = new Set(seasons.filter((s) => s.statusCategory === 'AVAILABLE').map((s) => s.seasonNumber));
  const allRegular = seasons.filter((s) => s.seasonNumber > 0).map((s) => s.seasonNumber);

  const wanted = new Set<number>();
  if (open.length === 0) {
    allRegular.forEach((n) => wanted.add(n));
  } else {
    for (const r of open) {
      let list: number[] | null = null;
      try { list = r.seasons ? (JSON.parse(r.seasons) as number[]) : null; } catch { list = null; }
      (list && list.length ? list : allRegular).forEach((n) => wanted.add(n));
    }
  }
  if (wanted.size === 0 || ![...wanted].every((n) => availableSeasons.has(n))) return changed;

  const recipients = await findAvailabilityRecipients(m.id);
  await promoteMediaToAvailable(m.id, !!m.availableAt);
  sendAvailabilityNotifications(m.title, 'tv', m.posterPath, m.id, m.tmdbId, recipients);
  logEvent('info', 'Zurg', `"${m.title}" is available, every requested season placed by zurg`);
  return true;
}

/** Tell requesters when zurg gives up on (or keeps failing at) something they asked for.
 *  Fires only on a transition observed during this process's lifetime, so a restart never
 *  replays old failures. */
async function alertOnStalls(jobs: ZurgJob[]): Promise<void> {
  const firstRun = previous.size === 0;
  const stalled: ZurgJob[] = [];
  for (const j of jobs) {
    const key = jobKey(j);
    const attempts = Number(j.attempts ?? 0) || 0;
    const prev = previous.get(key);
    previous.set(key, { state: j.state, attempts });
    if (firstRun || !prev) continue;
    const becameSetAside = j.state === 'set aside' && prev.state !== 'set aside' && !REMOVED_DETAIL.test(j.detail ?? '');
    const crossedAttempts = j.state === 'retrying' && prev.attempts < STALL_ATTEMPTS && attempts >= STALL_ATTEMPTS;
    if (becameSetAside || crossedAttempts) stalled.push(j);
  }
  if (stalled.length === 0) return;

  const locale = await getInstanceLocale();
  for (const j of stalled) {
    const t = parseJobTarget(j);
    if (!t) continue;
    const m = await prisma.media.findFirst({
      where: t.kind === 'movie' ? { mediaType: 'movie', radarrId: t.radarrId } : { mediaType: 'tv', sonarrId: t.sonarrId },
      select: { id: true, title: true, tmdbId: true, mediaType: true, statusCategory: true },
    });
    if (!m || m.statusCategory === 'AVAILABLE') continue;
    const recipients = await findAvailabilityRecipients(m.id);
    if (recipients.length === 0) continue;
    const reasonText = (j.detail ?? '').replace(/\s+for .*$/i, '').trim() || 'no suitable release yet';
    const typeLabel = renderNotificationTemplate(m.mediaType === 'tv' ? 'notifications.type.tv' : 'notifications.type.movie', locale, {});
    for (const userId of recipients) {
      safeUserNotify(userId, {
        type: 'acquisition_stalled',
        title: m.title,
        message: 'notifications.msg.acquisition_stalled',
        metadata: { mediaId: m.id, tmdbId: m.tmdbId, mediaType: m.mediaType, msgParams: { title: m.title, reason: reasonText } },
      });
    }
    await sendPushToUsers(recipients, {
      title: renderNotificationTemplate('notifications.push.acquisition_stalled.title', locale, { title: m.title, type: typeLabel }),
      body: renderNotificationTemplate('notifications.push.acquisition_stalled.body', locale, { reason: reasonText }),
      url: `/${m.mediaType}/${m.tmdbId}`,
    }, 'acquisition_stalled').catch(() => {});
    logEvent('info', 'Zurg', `"${m.title}", zurg ${j.state} (${reasonText}); requesters notified`);
  }
}

/** Start the background poll (idempotent). Runs the first pass shortly after boot. */
export function startZurgWatcher(): void {
  if (timer) return;
  const tick = () => { runZurgSync('poll').catch((err) => logEvent('debug', 'Zurg', `poll failed: ${String(err)}`)); };
  setTimeout(tick, 15_000).unref?.();
  timer = setInterval(tick, POLL_MS);
  timer.unref?.();
}

export function stopZurgWatcher(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

export type { ZurgConn };
