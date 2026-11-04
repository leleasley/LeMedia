import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { getRexConn, findRexRatingKey } from '../services/rex.js';
import { getFileInfo } from '../services/zurg/mediaInfo.js';
import { getZurgConn } from '../services/zurg/client.js';

/** Links to watch a title in the apps people actually use: Plezy (TMDB-addressed), the Plex
 *  app / web on rex (ratingKey confirmed by tmdb guid), and — for movies — Zurg's signed file
 *  link for Infuse or a copyable stream URL (home network / Tailscale only). */
export async function playRoutes(app: FastifyInstance) {
  app.get('/:mediaType/:tmdbId', {
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
    const { mediaType, tmdbId: raw } = request.params as { mediaType: 'movie' | 'tv'; tmdbId: string };
    const tmdbId = Number(raw);
    const media = await prisma.media.findFirst({ where: { tmdbId, mediaType }, select: { title: true, statusCategory: true } });

    const plezy = `plezy://play?type=${mediaType === 'movie' ? 'movie' : 'show'}&tmdb=${tmdbId}`;

    let plex: { app: string; web: string; server: string } | null = null;
    const rex = await getRexConn();
    if (rex?.machineId && media?.title) {
      const key = await findRexRatingKey(rex, mediaType, tmdbId, media.title);
      if (key) {
        const metadataKey = encodeURIComponent(`/library/metadata/${key}`);
        plex = {
          app: `plex://preplay/?metadataKey=${metadataKey}&metadataType=${mediaType === 'movie' ? 1 : 2}&server=${rex.machineId}`,
          web: `https://app.plex.tv/desktop#!/server/${rex.machineId}/details?key=${metadataKey}`,
          server: rex.name,
        };
      }
    }

    // A direct file only makes sense for a movie — a series would need an episode picker.
    let stream: string | null = null;
    if (mediaType === 'movie') {
      const [file, zurg] = await Promise.all([getFileInfo('movie', tmdbId), getZurgConn()]);
      if (file?.streamPath && zurg) stream = `${zurg.base}${file.streamPath.startsWith('/') ? '' : '/'}${file.streamPath}`;
    }

    return {
      title: media?.title ?? null,
      available: media?.statusCategory === 'AVAILABLE',
      plezy,
      plex,
      infuse: stream ? `infuse://x-callback-url/play?url=${encodeURIComponent(stream)}` : null,
      stream,
    };
  });
}
