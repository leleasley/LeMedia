import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { isPushConfigured, sendPushToUsers } from '../services/pushService.js';

export async function pushRoutes(app: FastifyInstance) {
  // POST /push/subscribe — save subscription for current user
  app.post('/subscribe', async (request, reply) => {
    if (!isPushConfigured()) return reply.status(503).send({ error: 'Push notifications not configured' });

    const user = request.user;
    const { endpoint, keys } = request.body as { endpoint: string; keys: { p256dh: string; auth: string } };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return reply.status(400).send({ error: 'Invalid subscription' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth }, // Don't overwrite userId, endpoint belongs to whoever registered it first
      create: { userId: user.id, endpoint, p256dh: keys.p256dh, auth: keys.auth },
    });

    return { ok: true };
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

// Legacy re-export — new code should import from services/pushService.js directly.
export { sendPushToUsers } from '../services/pushService.js';
