import { prisma } from '../utils/prisma.js';

export async function cleanupOrphanedRequests(): Promise<{ deleted: number }> {
  const result = await prisma.$executeRaw`DELETE FROM MediaRequest WHERE userId NOT IN (SELECT id FROM User) OR mediaId NOT IN (SELECT id FROM Media)`;
  return { deleted: result };
}

/** Purge `deleted` requests past the grace window (default 24h). The media row stays
 *  `UNAVAILABLE`, so the title simply shows as missing/requestable again afterwards.
 *  Uses `updatedAt` (the moment the webhook marked it deleted), not `createdAt`.
 *  Pass `maxAgeHrs: 0` for an admin "run now" — a deliberate button press means the grace
 *  window is not wanted; the scheduled tick keeps the default so it never removes something
 *  deleted a minute ago. */
export async function purgeDeletedRequests(maxAgeHrs = 24): Promise<{ purged: number; graceHrs: number }> {
  const where = maxAgeHrs > 0
    ? { status: 'deleted', updatedAt: { lt: new Date(Date.now() - maxAgeHrs * 3600 * 1000) } }
    : { status: 'deleted' };
  const result = await prisma.mediaRequest.deleteMany({ where });
  return { purged: result.count, graceHrs: maxAgeHrs };
}
