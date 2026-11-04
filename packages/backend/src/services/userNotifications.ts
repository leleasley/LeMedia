import { prisma } from '../utils/prisma.js';

interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

const REQUEST_TYPES = new Set([
  'request_approved', 'request_declined', 'media_available', 'request_pending_review', 'acquisition_stalled',
]);
const DIGITAL_TYPES = new Set(['digital_release_discovered', 'digital_release_day']);

/** Bell opt-outs: request updates and digital dates can each be muted per user.
 *  Unknown/internal types (support replies, plugin types) always deliver. */
export async function sendUserNotification(userId: number, payload: NotificationPayload): Promise<void> {
  if (REQUEST_TYPES.has(payload.type) || DIGITAL_TYPES.has(payload.type)) {
    const prefs = await prisma.user.findUnique({
      where: { id: userId },
      select: { notifyRequests: true, notifyDigital: true },
    }).catch(() => null);
    if (prefs) {
      if (REQUEST_TYPES.has(payload.type) && !prefs.notifyRequests) return;
      if (DIGITAL_TYPES.has(payload.type) && !prefs.notifyDigital) return;
    }
    // No prefs row readable (pre-migration) → deliver, preserving old behaviour.
  }
  await prisma.userNotification.create({
    data: {
      userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
    },
  });
}
