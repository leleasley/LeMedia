import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { prisma } from '../utils/prisma.js';
import { parseId } from '../utils/params.js';
import { getMovieDetails, getTvDetails } from '../services/tmdb.js';

async function requireValidToken(token: string) {
  if (!token || token.length < 10) return null;
  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link || link.expiresAt < new Date()) return null;
  return link;
}

const EXPIRY_OPTIONS = new Set([1, 7, 30, 3650]);

export async function shareRoutes(app: FastifyInstance) {
  // List own links - authenticated (registered before /:token so "mine" never hits the param route)
  app.get('/mine', async (request) => {
    const user = request.user;
    const links = await prisma.shareLink.findMany({
      where: { createdById: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return links.map((l) => ({
      token: l.token, url: `/s/${l.token}`, tmdbId: l.tmdbId, mediaType: l.mediaType,
      title: l.title, posterPath: l.posterPath, views: l.views,
      expiresAt: l.expiresAt, createdAt: l.createdAt,
    }));
  });

  // Create share link - authenticated
  app.post('/', async (request, reply) => {
    const user = request.user;
    const { tmdbId, mediaType, title, posterPath, expiresInDays } = request.body as {
      tmdbId?: unknown; mediaType?: unknown; title?: unknown; posterPath?: unknown; expiresInDays?: unknown;
    };
    const id = parseId(String(tmdbId ?? ''));
    if (!id || (mediaType !== 'movie' && mediaType !== 'tv')) {
      return reply.status(400).send({ error: 'Invalid tmdbId/mediaType' });
    }
    const days = typeof expiresInDays === 'number' && EXPIRY_OPTIONS.has(expiresInDays) ? expiresInDays : 7;
    const token = randomUUID().replaceAll('-', '');
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const link = await prisma.shareLink.create({
      data: {
        token, tmdbId: id, mediaType: mediaType as string, createdById: user.id, expiresAt,
        title: typeof title === 'string' ? title.slice(0, 200) : null,
        posterPath: typeof posterPath === 'string' ? posterPath.slice(0, 200) : null,
      },
    });
    return { token: link.token, url: `/s/${link.token}`, expiresAt: link.expiresAt };
  });

  // Revoke own link (admins may revoke anyone's)
  app.delete('/:token', async (request, reply) => {
    const user = request.user as { id: number; role: string };
    const { token } = request.params as { token: string };
    const link = await prisma.shareLink.findUnique({ where: { token } });
    if (!link) return reply.status(404).send({ error: 'Not found' });
    if (link.createdById !== user.id && user.role !== 'admin') {
      return reply.status(403).send({ error: 'FORBIDDEN' });
    }
    await prisma.shareLink.delete({ where: { token } });
    return { ok: true };
  });

  // Resolve share link - public, no auth (rbac.ts marks it PUBLIC)
  app.get('/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const link = await requireValidToken(token);
    if (!link) return reply.status(404).send({ error: 'Not found or expired' });
    return { tmdbId: link.tmdbId, mediaType: link.mediaType, expiresAt: link.expiresAt };
  });

  // Public TMDB detail for a shared title — token-scoped so this can't be used as an
  // open TMDB proxy. Only the linked title resolves; everything else 404s.
  app.get('/:token/detail', async (request, reply) => {
    const { token } = request.params as { token: string };
    const link = await requireValidToken(token);
    if (!link) return reply.status(404).send({ error: 'Not found or expired' });
    // View tracking — fire-and-forget, never blocks the detail response.
    prisma.shareLink.update({ where: { token }, data: { views: { increment: 1 } } }).catch(() => {});
    try {
      const details = link.mediaType === 'movie'
        ? await getMovieDetails(link.tmdbId)
        : await getTvDetails(link.tmdbId);
      return details;
    } catch {
      return reply.status(502).send({ error: 'Upstream unavailable' });
    }
  });
}
