import { prisma } from '../../utils/prisma.js';
import { safeNotify, safeUserNotify, getInstanceLocale } from '../../utils/safeNotify.js';
import { COMPLETABLE_REQUEST_STATUSES, renderNotificationTemplate } from '@lemedia/shared';
import type { PluginMediaAvailableV1 } from '@lemedia/shared';
import { sendPushToUsers } from '../pushService.js';
import { pluginEventBus } from '../../plugins/eventBus.js';
import { logEvent } from '../../utils/logEvent.js';

export interface SyncResult {
  added: number;
  updated: number;
  errors: number;
  duration: number;
}

/** Users whose request a transition to available would complete.
 *
 *  Read this BEFORE promoting the media: the promotion cascade flips exactly those rows to
 *  `available`, so asking afterwards returns nobody and every channel goes quiet. */
export async function findAvailabilityRecipients(mediaId: number): Promise<number[]> {
  const requests = await prisma.mediaRequest.findMany({
    where: { mediaId, status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
    select: { userId: true },
  });
  return [...new Set(requests.map((r) => r.userId))];
}

// ---------------------------------------------------------------------------
// Availability digest: one title flipping to AVAILABLE notifies immediately
// (today's behavior, zero delay). When a batch flips together — a sync run or
// a bulk webhook import — followers inside the window collapse into ONE digest
// notification + ONE push per user instead of N buzzes. Singles are untouched.
// Window from AVAILABILITY_DIGEST_MINUTES (default 0 = one alert per title, instantly; cap 120).
// ---------------------------------------------------------------------------

interface DigestItem {
  title: string;
  mediaType: 'movie' | 'tv';
  posterPath: string | null;
  mediaId: number;
  tmdbId: number;
}

/** Titles named in a digest (pre-joined, truncated — the template says "including"). */
const DIGEST_TITLE_LIMIT = 5;

const digestBuffers = new Map<number, DigestItem[]>();
const digestTimers = new Map<number, ReturnType<typeof setTimeout>>();

function digestWindowMs(): number {
  const raw = Number.parseInt(process.env.AVAILABILITY_DIGEST_MINUTES || '0', 10);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(raw, 120) * 60 * 1000;
}

async function sendSingleAvailability(userId: number, item: DigestItem): Promise<void> {
  safeUserNotify(userId, {
    type: 'media_available',
    title: item.title,
    message: 'notifications.msg.media_available',
    metadata: { mediaId: item.mediaId, tmdbId: item.tmdbId, mediaType: item.mediaType, posterPath: item.posterPath, msgParams: { title: item.title } },
  });

  const locale = await getInstanceLocale();
  try {
    const icon = item.posterPath ? `https://image.tmdb.org/t/p/w200${item.posterPath}` : undefined;
    const url = item.tmdbId > 0 ? `/${item.mediaType}/${item.tmdbId}` : '/requests';
    const typeLabel = renderNotificationTemplate(item.mediaType === 'tv' ? 'notifications.type.tv' : 'notifications.type.movie', locale, {});
    await sendPushToUsers([userId], {
      title: renderNotificationTemplate('notifications.push.media_available.title', locale, { title: item.title, type: typeLabel }),
      body: renderNotificationTemplate('notifications.push.media_available.body', locale),
      icon,
      url,
    }, 'media_available');
  } catch (err) {
    logEvent('warn', 'Notif', `Web push fan-out failed for media ${item.mediaId}: ${String(err)}`);
  }
}

async function sendDigestAvailability(userId: number, items: DigestItem[]): Promise<void> {
  const count = items.length;
  const titles = items.slice(0, DIGEST_TITLE_LIMIT).map((i) => i.title).join(', ');
  safeUserNotify(userId, {
    type: 'media_available',
    title: 'notifications.msg.media_available_digest_title',
    message: 'notifications.msg.media_available_digest',
    metadata: { digest: true, count, mediaIds: items.map((i) => i.mediaId), msgParams: { count, titles } },
  });

  const locale = await getInstanceLocale();
  try {
    const firstPoster = items.find((i) => i.posterPath)?.posterPath;
    await sendPushToUsers([userId], {
      title: renderNotificationTemplate('notifications.push.media_available_digest.title', locale, { count }),
      // Name the titles with their type so the alert is useful without opening the app.
      body: items.slice(0, DIGEST_TITLE_LIMIT)
        .map((i) => `${i.title} (${renderNotificationTemplate(i.mediaType === 'tv' ? 'notifications.type.tv' : 'notifications.type.movie', locale, {})})`)
        .join(', ') + (count > DIGEST_TITLE_LIMIT ? '…' : ''),
      icon: firstPoster ? `https://image.tmdb.org/t/p/w200${firstPoster}` : undefined,
      url: '/requests',
    }, 'media_available');
  } catch (err) {
    logEvent('warn', 'Notif', `Web push digest fan-out failed for user ${userId} (${count} titles): ${String(err)}`);
  }
}

async function flushAvailabilityDigest(userId: number): Promise<void> {
  const items = digestBuffers.get(userId) ?? [];
  digestBuffers.delete(userId);
  if (items.length === 0) return;
  if (items.length === 1) {
    await sendSingleAvailability(userId, items[0]);
    return;
  }
  await sendDigestAvailability(userId, items);
}

function queueAvailabilityForUser(userId: number, item: DigestItem): void {
  if (digestWindowMs() === 0) {
    void sendSingleAvailability(userId, item);
    return;
  }
  if (!digestTimers.has(userId)) {
    // First in window goes out immediately; the window stays open for batch followers.
    void sendSingleAvailability(userId, item);
    const timer = setTimeout(() => {
      digestTimers.delete(userId);
      void flushAvailabilityDigest(userId);
    }, digestWindowMs());
    // Never hold the process open for a notification timer (tests, one-shot runs).
    if (typeof (timer as { unref?: () => void }).unref === 'function') {
      (timer as unknown as { unref: () => void }).unref();
    }
    digestTimers.set(userId, timer);
    return;
  }
  const buf = digestBuffers.get(userId) ?? [];
  buf.push(item);
  digestBuffers.set(userId, buf);
}

/** Flush every pending digest now (tests + graceful shutdown). Clears timers first
 *  so a later tick can't double-send. */
export async function flushAvailabilityDigests(): Promise<void> {
  for (const timer of digestTimers.values()) clearTimeout(timer);
  digestTimers.clear();
  const pending = [...digestBuffers.entries()];
  digestBuffers.clear();
  for (const [userId, items] of pending) {
    if (items.length === 1) await sendSingleAvailability(userId, items[0]);
    else if (items.length > 1) await sendDigestAvailability(userId, items);
  }
}

export async function sendAvailabilityNotifications(
  title: string,
  mediaType: 'movie' | 'tv',
  posterPath: string | null,
  mediaId: number,
  tmdbId: number,
  recipientUserIds?: number[],
): Promise<void> {
  // Fetch completable requests BEFORE the caller cascades them to 'available'.
  // Also include 'available' updated in the last 10 min as a fallback for the
  // webhook path where promoteMediaToAvailable already ran before we were called.
  // Callers that promote first must capture the requesters beforehand (see
  // findAvailabilityRecipients) and hand them over — otherwise the lookup below
  // comes back empty and every channel goes quiet.
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const requests = recipientUserIds
    ? recipientUserIds.map((userId) => ({ userId }))
    : await prisma.mediaRequest.findMany({
      where: {
        mediaId,
        OR: [
          { status: { in: [...COMPLETABLE_REQUEST_STATUSES] } },
          { status: 'available', updatedAt: { gte: since } },
        ],
      },
      select: { userId: true },
    });
  if (requests.length === 0) return;
  try {

    safeNotify('media_available', { title, mediaType, posterPath });

    const userIds = [...new Set(requests.map(r => r.userId))];

    const event: PluginMediaAvailableV1 = {
      v: 1,
      mediaId,
      tmdbId,
      mediaType,
      title,
      posterPath,
      requesterUserIds: userIds,
    };
    pluginEventBus.emit('media.available', event).catch(err => {
      logEvent('error', 'PluginEvent', `Subscriber of 'media.available' threw: ${String(err)}`);
    });

    for (const userId of userIds) {
      queueAvailabilityForUser(userId, { title, mediaType, posterPath, mediaId, tmdbId });
    }
  } catch (err) {
    logEvent('error', 'Notif', `sendAvailabilityNotifications failed for media ${mediaId}: ${String(err)}`);
  }
}
