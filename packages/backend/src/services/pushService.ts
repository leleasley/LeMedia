import webpush from 'web-push';
import { withRetry } from '../utils/fetchWithRetry.js';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';

/** Web-push VAPID setup + fan-out. Consumed by routes (one-way dependency). */

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@lemedia.app';

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

export function isPushConfigured(): boolean {
  return Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
}

/** Push notification types a user can switch off individually (profile → Notifications). */
export const PUSH_TYPES = [
  'request_approved',
  'request_declined',
  'media_available',
  'digital_release_discovered',
  'digital_release_day',
  'acquisition_stalled',
  // Admins only: stack events (see services/stackWatch.ts).
  'list_added',
  'app_update',
  'zurg_broken',
] as const;
export type PushType = typeof PUSH_TYPES[number];

/** Parse the stored opt-out map; anything unknown/missing counts as enabled. */
export function parsePushPrefs(raw: string | null | undefined): Record<PushType, boolean> {
  let stored: Record<string, unknown> = {};
  try { stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}; } catch { /* corrupt → defaults */ }
  return Object.fromEntries(PUSH_TYPES.map((t) => [t, stored[t] !== false])) as Record<PushType, boolean>;
}

export async function sendPushToUsers(
  userIds: number[],
  payload: { title: string; body: string; icon?: string; url?: string },
  /** When set, users who switched this type off in their profile are skipped. */
  type?: PushType,
): Promise<{ sent: number; failed: number; lastError?: string }> {
  const result: { sent: number; failed: number; lastError?: string } = { sent: 0, failed: 0 };
  if (!isPushConfigured()) return result;

  if (type) {
    const prefs = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, pushPrefs: true } });
    const muted = new Set(prefs.filter((u) => !parsePushPrefs(u.pushPrefs)[type]).map((u) => u.id));
    userIds = userIds.filter((id) => !muted.has(id));
    if (userIds.length === 0) return result;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });

  const payloadStr = JSON.stringify(payload);

  for (const sub of subscriptions) {
    try {
      // Retry on transient push-endpoint failures (mozilla/google brief 5xx during rollouts).
      // 404/410 bubble as-is since they indicate a permanently-dead subscription we clean up.
      await withRetry(
        () => webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadStr,
        ),
        { label: 'WebPush' },
      );
      result.sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      result.failed++;
      result.lastError = `${statusCode ?? ''} ${String((err as { body?: unknown })?.body ?? err)}`.trim().slice(0, 300);
      logEvent('warn', 'WebPush', `delivery failed (${statusCode ?? 'no status'}): ${result.lastError}`);
      if (statusCode === 410 || statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } })
          .catch((dbErr) => logEvent('warn', 'WebPush', `stale subscription cleanup failed: ${String(dbErr)}`));
      }
    }
  }
  return result;
}
