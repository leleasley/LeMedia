import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { isPushConfigured, sendPushToUsers } from '../services/pushService.js';

export async function pushRoutes(app: FastifyInstance) {
  // POST /push/subscribe — save subscription for current user
  app.post('/subscribe', async (request, reply) => {
    if (!isPushConfigured()) return reply.status(503).send({ error: 'Push notifications not configured' });

    const user = request.user;
    const { endpoint, keys, deviceId, userAgent } = request.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      deviceId?: string;
      userAgent?: string;
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.status(400).send({ error: 'Invalid subscription' });
    }

    // Only a simple opaque id is stored; anything else is dropped rather than trusted.
    const device = typeof deviceId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(deviceId) ? deviceId : null;
    const agent = typeof userAgent === 'string' ? userAgent.slice(0, 300) : null;

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, ...(device ? { deviceId: device } : {}), userAgent: agent, lastSeenAt: new Date() }, // Don't overwrite userId, endpoint belongs to whoever registered it first
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, deviceId: device, userAgent: agent, lastSeenAt: new Date() },
    });

    // Browsers issue a new endpoint when the old subscription is gone (reinstalled PWA, cleared
    // data). Without this the wallet of old endpoints keeps growing and every alert is delivered
    // once per entry — the same phone buzzing twice for the same film.
    if (device) {
      const stale = await prisma.pushSubscription.deleteMany({
        where: { userId: user.id, deviceId: device, endpoint: { not: endpoint } },
      });
      if (stale.count > 0) {
        await prisma.pushSubscription.updateMany({
          where: { userId: user.id, deviceId: device, endpoint },
          data: { lastSeenAt: new Date() },
        }).catch(() => {});
      }
    }

    return { ok: true };
  });

  // GET /push/devices — where this account currently receives push.
  app.get('/devices', async (request) => {
    const user = request.user;
    const current = String((request.query as { deviceId?: string }).deviceId ?? '');
    const subs = await prisma.pushSubscription.findMany({
      where: { userId: user.id },
      select: { id: true, deviceId: true, userAgent: true, createdAt: true, lastSeenAt: true, endpoint: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      devices: subs.map((s) => ({
        id: s.id,
        current: !!current && s.deviceId === current,
        platform: describeDevice(s.userAgent, s.endpoint),
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt ?? s.createdAt,
      })),
    };
  });

  // DELETE /push/devices/:id — remove one registered device (e.g. an old install still buzzing).
  app.delete('/devices/:id', async (request, reply) => {
    const user = request.user;
    const id = Number.parseInt((request.params as { id: string }).id, 10);
    if (!Number.isFinite(id)) return reply.status(400).send({ error: 'Invalid device' });
    const deleted = await prisma.pushSubscription.deleteMany({ where: { id, userId: user.id } });
    return { ok: true, deleted: deleted.count };
  });

  // POST /push/test — send a test notification to the current user's devices
  app.post('/test', async (request, reply) => {
    if (!isPushConfigured()) return reply.status(503).send({ error: 'Push notifications not configured' });
    const user = request.user;
    const devices = await prisma.pushSubscription.count({ where: { userId: user.id } });
    if (devices === 0) return reply.status(404).send({ error: 'No devices registered for push' });
    const result = await sendPushToUsers([user.id], {
      title: 'Notifications are on',
      body: "You'll get an alert here when your requests are approved, declined or ready to watch.",
      url: '/',
    });
    return { ok: result.sent > 0, devices, ...result };
  });

  // DELETE /push/unsubscribe — remove subscription
  app.delete('/unsubscribe', async (request) => {
    const user = request.user;
    const { endpoint } = request.body as { endpoint: string };

    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
    } else {
      // Delete all subscriptions for this user
      await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
    }

    return { ok: true };
  });
}

/** A short human label for a subscription, e.g. "iPhone · Safari". */
export function describeDevice(userAgent: string | null, endpoint: string): string {
  const ua = userAgent ?? '';
  const device = /iphone/i.test(ua) ? 'iPhone'
    : /ipad/i.test(ua) ? 'iPad'
      : /android/i.test(ua) ? 'Android'
        : /macintosh|mac os x/i.test(ua) ? 'Mac'
          : /windows/i.test(ua) ? 'Windows'
            : /linux/i.test(ua) ? 'Linux'
              : endpoint.includes('web.push.apple.com') ? 'Apple device'
                : 'Browser';
  const browser = /edg\//i.test(ua) ? 'Edge'
    : /firefox/i.test(ua) ? 'Firefox'
      : /chrome|crios/i.test(ua) ? 'Chrome'
        : /safari/i.test(ua) ? 'Safari'
          : null;
  return browser ? `${device} · ${browser}` : device;
}

// Legacy re-export — new code should import from services/pushService.js directly.
export { sendPushToUsers } from '../services/pushService.js';
