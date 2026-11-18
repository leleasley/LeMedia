import type { FastifyInstance } from 'fastify';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';
import { safeUserNotify } from '../utils/safeNotify.js';

const CATEGORIES = new Set(['playback', 'wrong_file', 'audio', 'subtitles', 'other']);

function categoryLabel(category: string): string {
  switch (category) {
    case 'playback': return 'Playback';
    case 'wrong_file': return 'Wrong file';
    case 'audio': return 'Audio';
    case 'subtitles': return 'Subtitles';
    default: return 'Other';
  }
}

/**
 * "Report an issue" on a title the user already has.
 *
 * A plain record for admins to triage — nothing here changes the library. The media row's own
 * title wins over whatever the client sent, so the admin always sees a recognisable name.
 */
export async function issueRoutes(app: FastifyInstance) {
  app.post('/', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    schema: {
      body: {
        type: 'object',
        required: ['tmdbId', 'mediaType', 'message'],
        properties: {
          tmdbId: { type: 'number' },
          mediaType: { type: 'string', enum: ['movie', 'tv'] },
          title: { type: 'string' },
          category: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const user = request.user;
    const body = request.body as { tmdbId: number; mediaType: 'movie' | 'tv'; title?: string; category?: string; message: string };
    const category = CATEGORIES.has(String(body.category)) ? String(body.category) : 'other';
    const message = String(body.message ?? '').trim();
    if (message.length < 10 || message.length > 2000) {
      return reply.status(400).send({ error: 'Describe the issue in 10–2000 characters' });
    }

    const media = await prisma.media.findUnique({
      where: { tmdbId_mediaType: { tmdbId: body.tmdbId, mediaType: body.mediaType } },
      select: { id: true, title: true },
    }).catch(() => null);
    const title = (media?.title ?? String(body.title ?? '')).trim().slice(0, 200) || 'Unknown';

    const issue = await prisma.mediaIssue.create({
      data: {
        mediaId: media?.id ?? null,
        tmdbId: body.tmdbId,
        mediaType: body.mediaType,
        title,
        userId: user.id,
        category,
        message,
      },
    });

    logEvent('info', 'Support', `Issue reported: "${title}" (${categoryLabel(category)}) by user ${user.id}`);

    // Bell for admins. Custom roles are not covered here — the built-in admin is.
    const admins = await prisma.user.findMany({ where: { role: 'admin', disabled: false }, select: { id: true } }).catch(() => []);
    for (const admin of admins) {
      safeUserNotify(admin.id, {
        type: 'support_issue',
        title: `Issue: ${title}`,
        message: `${categoryLabel(category)} — ${message.slice(0, 140)}`,
        metadata: { tmdbId: body.tmdbId, mediaType: body.mediaType, issueId: issue.id },
      });
    }

    return reply.status(201).send({ ok: true, id: issue.id });
  });
}
