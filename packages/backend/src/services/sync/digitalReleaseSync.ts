import { prisma } from '../../utils/prisma.js';
import { getMovieDetails, extractDigitalRelease } from '../tmdb.js';
import { logEvent } from '../../utils/logEvent.js';
import { chunk } from '../../utils/batch.js';
import { notifyDigitalReleases } from './digitalReleaseNotify.js';

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1000;
// Bound the work per tick: TMDB details are cached 24h, but the first backfill over a big
// library still fans out — the next daily tick picks up where this one stopped (oldest first).
const MAX_PER_RUN = 100;
/** Cap for the date-refresh pass (recent/upcoming + requested-but-missing titles). */
const MAX_REFRESH_PER_RUN = 150;

/** Backfill TMDB digital release dates for tracked movies that don't have one yet.
 *  Movies TMDB knows nothing about keep NULL and are retried on later ticks (cheap — the
 *  details payload is already in TmdbCache for 24h after the first lookup).
 *  Ends with the notify pass so requested movies alert on detection + release day. */
export async function syncDigitalReleases(): Promise<{ synced: number; skipped: number; errors: number; discoveredNotified: number; releasedNotified: number }> {
  let synced = 0;
  let skipped = 0;
  let errors = 0;

  const candidates = await prisma.media.findMany({
    where: { mediaType: 'movie', tmdbId: { gt: 0 }, digitalReleaseDate: null },
    select: { id: true, tmdbId: true, title: true },
    orderBy: { updatedAt: 'asc' },
    take: MAX_PER_RUN,
  });

  if (candidates.length > 0) {
    logEvent('debug', 'DigitalReleaseSync', `${candidates.length} movies without a digital release date`);

    const batches = chunk(candidates, BATCH_SIZE);
    for (let b = 0; b < batches.length; b++) {
      for (const media of batches[b]) {
        try {
          const details = await getMovieDetails(media.tmdbId);
          const date = await extractDigitalRelease(details);
          if (date) {
            await prisma.media.update({
              where: { id: media.id },
              data: { digitalReleaseDate: date },
            });
            synced++;
          } else {
            skipped++;
          }
        } catch (err) {
          errors++;
          logEvent('debug', 'DigitalReleaseSync', `Failed for "${media.title}" (tmdb:${media.tmdbId}): ${err}`);
        }
      }

      if (b < batches.length - 1) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    logEvent('info', 'DigitalReleaseSync', `Synced digital dates: ${synced} ok, ${skipped} unknown, ${errors} errors`);
  }

  // Refresh pass: TMDB dates move (placeholders get corrected, regions get added), so
  // re-check dates that still matter — recent/upcoming ones, plus requested titles we don't
  // have yet (a stale US date can hide a later UK one). A moved date re-arms release-day.
  const day = 86400000;
  const recentFrom = new Date(Date.now() - 7 * day).toISOString().slice(0, 10);
  const requestedFrom = new Date(Date.now() - 120 * day).toISOString().slice(0, 10);
  const toRefresh = await prisma.media.findMany({
    where: {
      mediaType: 'movie',
      tmdbId: { gt: 0 },
      OR: [
        { digitalReleaseDate: { gte: recentFrom } },
        { digitalReleaseDate: { gte: requestedFrom }, requests: { some: {} }, statusCategory: { not: 'AVAILABLE' } },
      ],
    },
    select: { id: true, tmdbId: true, title: true, digitalReleaseDate: true },
    take: MAX_REFRESH_PER_RUN,
  });
  let refreshed = 0;
  for (const [b, batch] of chunk(toRefresh, BATCH_SIZE).entries()) {
    if (b > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    for (const media of batch) {
      try {
        const date = await extractDigitalRelease(await getMovieDetails(media.tmdbId));
        if (date && date !== media.digitalReleaseDate) {
          await prisma.media.update({
            where: { id: media.id },
            data: { digitalReleaseDate: date, digitalReleaseNotifiedAt: null },
          });
          refreshed++;
          logEvent('debug', 'DigitalReleaseSync', `"${media.title}" digital date ${media.digitalReleaseDate} → ${date}`);
        }
      } catch (err) {
        logEvent('debug', 'DigitalReleaseSync', `Refresh failed for "${media.title}" (tmdb:${media.tmdbId}): ${err}`);
      }
    }
  }
  if (refreshed > 0) logEvent('info', 'DigitalReleaseSync', `Updated ${refreshed} changed digital dates`);

  const { discoveredNotified, releasedNotified } = await notifyDigitalReleases();
  return { synced, skipped, errors, discoveredNotified, releasedNotified };
}
