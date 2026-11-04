import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { prisma } from '../src/utils/prisma.js';
import { sendAvailabilityNotifications, flushAvailabilityDigests } from '../src/services/sync/helpers.js';

process.env.AVAILABILITY_DIGEST_MINUTES = '10';

const email = 'digest@test.local';
const TITLES = ['Digest Movie A', 'Digest Movie B', 'Digest Movie C'];

async function waitForRows(userId: number, count: number, timeoutMs = 3000) {
  const start = Date.now();
  for (;;) {
    const rows = await prisma.userNotification.findMany({ where: { userId }, orderBy: { id: 'asc' } });
    if (rows.length >= count) return rows;
    if (Date.now() - start > timeoutMs) return rows;
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('availability digest', () => {
  let userId: number;
  let mediaIds: number[];

  beforeEach(async () => {
    await prisma.userNotification.deleteMany({ where: { user: { email } } });
    await prisma.mediaRequest.deleteMany({ where: { user: { email } } });
    await prisma.media.deleteMany({ where: { title: { in: TITLES } } });
    await prisma.user.deleteMany({ where: { email } });
    await flushAvailabilityDigests();

    userId = (await prisma.user.create({ data: { email, displayName: 'Digest', role: 'user' } })).id;
    mediaIds = [];
    for (let i = 0; i < TITLES.length; i++) {
      const m = await prisma.media.create({ data: { tmdbId: 900001 + i, mediaType: 'movie', title: TITLES[i] } });
      mediaIds.push(m.id);
      await prisma.mediaRequest.create({ data: { mediaId: m.id, userId, mediaType: 'movie', status: 'approved' } });
    }
  });

  afterEach(async () => {
    await flushAvailabilityDigests();
  });

  it('sends the first title immediately, collapses followers into one digest', async () => {
    // Three titles flip in the same sync tick.
    sendAvailabilityNotifications(TITLES[0], 'movie', null, mediaIds[0], 900001);
    sendAvailabilityNotifications(TITLES[1], 'movie', null, mediaIds[1], 900002);
    sendAvailabilityNotifications(TITLES[2], 'movie', null, mediaIds[2], 900003);

    // First is instant…
    const afterImmediate = await waitForRows(userId, 1);
    expect(afterImmediate).toHaveLength(1);
    expect(afterImmediate[0].message).toBe('notifications.msg.media_available');
    expect(afterImmediate[0].title).toBe(TITLES[0]);

    // …followers stay buffered until the window flushes.
    await new Promise((r) => setTimeout(r, 200));
    expect(await prisma.userNotification.count({ where: { userId } })).toBe(1);

    await flushAvailabilityDigests();
    const rows = await waitForRows(userId, 2);
    expect(rows).toHaveLength(2);
    expect(rows[1].message).toBe('notifications.msg.media_available_digest');
    const meta = JSON.parse(rows[1].metadata as string);
    expect(meta.digest).toBe(true);
    expect(meta.msgParams.count).toBe(2);
    expect(meta.msgParams.titles).toContain(TITLES[1]);
    expect(meta.msgParams.titles).toContain(TITLES[2]);
  });

  it('a lone title behaves exactly as before (single notification, no digest)', async () => {
    sendAvailabilityNotifications(TITLES[0], 'movie', null, mediaIds[0], 900001);
    const rows = await waitForRows(userId, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe(TITLES[0]);
    await flushAvailabilityDigests();
    expect(await prisma.userNotification.count({ where: { userId } })).toBe(1);
  });
});
