import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getZurgJobsFor, getZurgSnapshot } from '../services/zurg/watcher.js';
import { parseJobTarget } from '../services/zurg/client.js';
import { getFileInfo } from '../services/zurg/mediaInfo.js';

/** What zurg is doing about one title — shown on detail pages and request rows. Read-only,
 *  served from the watcher's last snapshot (never calls zurg per request). Placement paths
 *  are reduced to a boolean: they are server internals. */
export async function zurgRoutes(app: FastifyInstance) {
  app.get('/media/:mediaType/:tmdbId', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['mediaType', 'tmdbId'],
        properties: {
          mediaType: { type: 'string' as const, enum: ['movie', 'tv'] },
          tmdbId: { type: 'string' as const, pattern: '^[0-9]+$' },
        },
      },
    },
  }, async (request) => {
    const { mediaType, tmdbId } = request.params as { mediaType: 'movie' | 'tv'; tmdbId: string };
    const snap = getZurgSnapshot();
    if (!snap.status) return { configured: !!snap.serviceName, jobs: [] };

    const media = await prisma.media.findFirst({
      where: { tmdbId: Number(tmdbId), mediaType },
      select: { mediaType: true, radarrId: true, sonarrId: true },
    });
    if (!media) return { configured: true, fetchedAt: snap.fetchedAt, jobs: [] };

    const jobs = getZurgJobsFor(media).map((j) => {
      const t = parseJobTarget(j);
      return {
        state: j.state,
        detail: j.detail ?? null,
        nextRetry: j.next_retry ?? null,
        attempts: j.attempts ?? null,
        release: j.release ?? null,
        quality: j.quality ?? null,
        placed: !!j.placed,
        updatedAt: j.updated_at ?? null,
        season: t?.kind === 'tv' ? t.season : null,
        episodes: t?.kind === 'tv' && t.firstEp !== null ? [t.firstEp, t.lastEp] : null,
      };
    }).sort((a, b) => (a.season ?? 0) - (b.season ?? 0));
    return { configured: true, fetchedAt: snap.fetchedAt, jobs };
  });

  // The real file behind a title (zurg's stored ffprobe analysis), summarised.
  app.get('/media/:mediaType/:tmdbId/file', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['mediaType', 'tmdbId'],
        properties: {
          mediaType: { type: 'string' as const, enum: ['movie', 'tv'] },
          tmdbId: { type: 'string' as const, pattern: '^[0-9]+$' },
        },
      },
    },
  }, async (request) => {
    const { mediaType, tmdbId } = request.params as { mediaType: 'movie' | 'tv'; tmdbId: string };
    return { file: await getFileInfo(mediaType, Number(tmdbId)) };
  });
}
