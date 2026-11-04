import { prisma } from './prisma.js';

const CACHE_TTL_HOURS = 24;
/** How long an expired entry may still be served while a background refresh runs. Past this
 *  it's treated as a miss (and the nightly cleanup removes it). */
const STALE_GRACE_HOURS = 7 * 24;

/** Fresh entries only — expired ones count as a miss (kept for stale-while-revalidate). */
export async function getCached<T>(key: string): Promise<T | null> {
  const entry = await getCachedEntry<T>(key);
  return entry && !entry.stale ? entry.data : null;
}

/** Entry plus whether it's past its TTL. Never deletes on read: an expired entry is still a
 *  perfectly good answer while the next copy is fetched, and deleting on the hot path made
 *  the first visitor after expiry wait on TMDB. Unparseable data is treated as a miss. */
export async function getCachedEntry<T>(key: string): Promise<{ data: T; stale: boolean } | null> {
  const entry = await prisma.tmdbCache.findUnique({ where: { cacheKey: key } });
  if (!entry) return null;
  const now = Date.now();
  if (now > entry.expiresAt.getTime() + STALE_GRACE_HOURS * 3600_000) return null;
  try {
    return { data: JSON.parse(entry.data) as T, stale: now > entry.expiresAt.getTime() };
  } catch {
    return null;
  }
}

export async function setCache(key: string, data: unknown, ttlHours = CACHE_TTL_HOURS): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
  await prisma.tmdbCache.upsert({
    where: { cacheKey: key },
    update: { data: JSON.stringify(data), expiresAt },
    create: { cacheKey: key, data: JSON.stringify(data), expiresAt },
  });
}

/** Nightly cleanup — only entries beyond the stale grace window, so stale-while-revalidate
 *  still has something to serve. */
export async function clearExpiredCache(): Promise<number> {
  const result = await prisma.tmdbCache.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - STALE_GRACE_HOURS * 3600_000) } },
  });
  return result.count;
}
