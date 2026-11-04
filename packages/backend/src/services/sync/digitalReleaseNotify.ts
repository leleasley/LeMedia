import { prisma } from '../../utils/prisma.js';
import { safeNotify, safeUserNotify, getInstanceLocale } from '../../utils/safeNotify.js';
import { renderNotificationTemplate } from '@lemedia/shared';
import { sendPushToUsers } from '../pushService.js';
import { getMovieWatchOptions } from '../tmdb.js';
import { logEvent } from '../../utils/logEvent.js';

// Bound the discovery burst: the first tick after enabling can surface dozens of dates at
// once — oldest first, the next daily tick continues. Release-day volume is naturally tiny.
const MAX_DISCOVERY_PER_RUN = 25;
// Discovery notifies only for dates within this window (released in the last 7 days or
// upcoming). Anything older is almost certainly a backfill artefact ("digital since 2012") —
// the date still shows on the page + calendar, but nobody needs a bell for it.
const DISCOVERY_CUTOFF_DAYS = 7;

type DigitalKind = 'digital_release_discovered' | 'digital_release_day';

interface DigitalMovie {
  id: number;
  tmdbId: number;
  title: string;
  posterPath: string | null;
  digitalReleaseDate: string;
}

function formatDate(ymd: string, locale: string): string {
  try {
    return new Date(`${ymd}T00:00:00`).toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return ymd;
  }
}

async function notifyMovie(kind: DigitalKind, movie: DigitalMovie): Promise<number> {
  const locale = await getInstanceLocale();
  const date = formatDate(movie.digitalReleaseDate, locale);
  // Release day: say where it can actually be watched (streaming beats rent/buy).
  let where = '';
  if (kind === 'digital_release_day') {
    const opts = await getMovieWatchOptions(movie.tmdbId).catch(() => null);
    if (opts?.stream.length) where = renderNotificationTemplate('notifications.push.where.stream', locale, { services: opts.stream.slice(0, 2).join(', ') });
    else if (opts?.rent.length || opts?.buy.length) where = renderNotificationTemplate('notifications.push.where.rent', locale, { services: [...new Set([...(opts.rent ?? []), ...(opts.buy ?? [])])].slice(0, 2).join(', ') });
  }

  // Broadcast channels (Discord/Telegram/Email) — matrix-gated in the registry, so new
  // event types stay silent until the admin opts them in.
  safeNotify(kind, { title: movie.title, mediaType: 'movie', posterPath: movie.posterPath });

  const rows = await prisma.mediaRequest.findMany({
    where: { mediaId: movie.id },
    select: { userId: true },
  });
  const userIds = [...new Set(rows.map((r) => r.userId))];

  for (const userId of userIds) {
    safeUserNotify(userId, {
      type: kind,
      title: movie.title,
      message: `notifications.msg.${kind}`,
      metadata: {
        mediaId: movie.id,
        tmdbId: movie.tmdbId,
        mediaType: 'movie',
        posterPath: movie.posterPath,
        msgParams: { title: movie.title, date },
      },
    });
    try {
      await sendPushToUsers([userId], {
        title: renderNotificationTemplate(`notifications.push.${kind}.title`, locale, { title: movie.title, type: renderNotificationTemplate('notifications.type.movie', locale, {}) }),
        body: where || renderNotificationTemplate(`notifications.push.${kind}.body`, locale, { date }),
        icon: movie.posterPath ? `https://image.tmdb.org/t/p/w200${movie.posterPath}` : undefined,
        url: movie.tmdbId > 0 ? `/movie/${movie.tmdbId}` : '/requests',
      }, kind);
    } catch (err) {
      logEvent('warn', 'Notif', `Web push fan-out failed for digital ${kind} media ${movie.id}: ${String(err)}`);
    }
  }
  return userIds.length;
}

/** Notify requesters about digital dates: newly detected + released today. Runs at the end
 *  of the daily digital_release_sync tick. Flags on the Media row dedupe — each movie
 *  notifies at most once per kind, regardless of which path filled the date in. */
export async function notifyDigitalReleases(): Promise<{ discoveredNotified: number; releasedNotified: number }> {
  let discoveredNotified = 0;
  let releasedNotified = 0;
  const today = new Date().toISOString().slice(0, 10);
  const select = { id: true, tmdbId: true, title: true, posterPath: true, digitalReleaseDate: true, statusCategory: true };
  // Nobody needs "coming to digital" for a film that's already on the server.
  const alreadyHave = (m: { statusCategory: string | null }) => m.statusCategory === 'AVAILABLE';

  // 1. Dates detected since the last tick, on movies someone requested.
  const fresh = await prisma.media.findMany({
    where: {
      mediaType: 'movie',
      tmdbId: { gt: 0 },
      digitalReleaseDate: { not: null },
      digitalDiscoveredNotifiedAt: null,
      requests: { some: {} },
    },
    select,
    orderBy: { updatedAt: 'asc' },
    take: MAX_DISCOVERY_PER_RUN,
  });
  for (const m of fresh) {
    if (!m.digitalReleaseDate) continue;
    try {
      // Ancient dates are backfill artefacts — flag silently, notify only recent/upcoming.
      const cutoff = new Date(Date.now() - DISCOVERY_CUTOFF_DAYS * 86400000).toISOString().slice(0, 10);
      if (m.digitalReleaseDate >= cutoff && !alreadyHave(m)) {
        await notifyMovie('digital_release_discovered', { ...m, digitalReleaseDate: m.digitalReleaseDate });
        discoveredNotified++;
      }
    } catch (err) {
      logEvent('error', 'Notif', `Digital discovery notify failed for "${m.title}": ${String(err)}`);
    } finally {
      await prisma.media.update({
        where: { id: m.id },
        data: { digitalDiscoveredNotifiedAt: new Date() },
      }).catch((dbErr) => {
        logEvent('warn', 'Notif', `Failed to persist discovery flag for "${m.title}": ${String(dbErr)}`);
      });
    }
  }

  // 2. Digital release day.
  const due = await prisma.media.findMany({
    where: {
      mediaType: 'movie',
      tmdbId: { gt: 0 },
      // Small catch-up window so a missed tick (restart, outage) doesn't lose the alert.
      digitalReleaseDate: { gte: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), lte: today },
      digitalReleaseNotifiedAt: null,
      requests: { some: {} },
    },
    select,
  });
  for (const m of due) {
    if (!m.digitalReleaseDate) continue;
    try {
      if (!alreadyHave(m)) {
        await notifyMovie('digital_release_day', { ...m, digitalReleaseDate: m.digitalReleaseDate });
        releasedNotified++;
      }
    } catch (err) {
      logEvent('error', 'Notif', `Digital release-day notify failed for "${m.title}": ${String(err)}`);
    } finally {
      await prisma.media.update({
        where: { id: m.id },
        data: { digitalReleaseNotifiedAt: new Date() },
      }).catch((dbErr) => {
        logEvent('warn', 'Notif', `Failed to persist release flag for "${m.title}": ${String(dbErr)}`);
      });
    }
  }

  if (discoveredNotified > 0 || releasedNotified > 0) {
    logEvent('info', 'DigitalReleaseSync', `Notified: ${discoveredNotified} discoveries, ${releasedNotified} releases`);
  }
  return { discoveredNotified, releasedNotified };
}
