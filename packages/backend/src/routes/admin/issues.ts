import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';

/** Admin → Issues: triage the reports users raise on titles they already have. */
export async function issuesAdminRoutes(app: FastifyInstance) {
  app.get('/issues', async (request) => {
    const status = String((request.query as { status?: string }).status ?? 'open');
    const where = status === 'all' ? {} : { status: status === 'resolved' ? 'resolved' : 'open' };
    const [items, openCount] = await Promise.all([
      prisma.mediaIssue.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
        include: {
          user: { select: { id: true, displayName: true, avatar: true } },
          resolvedBy: { select: { displayName: true } },
          media: { select: { posterPath: true, statusCategory: true } },
        },
      }),
      prisma.mediaIssue.count({ where: { status: 'open' } }),
    ]);
    return { items, openCount };
  });

  app.put('/issues/:id/resolve', { schema: { body: { type: 'object', properties: { note: { type: 'string' } } } } }, async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.status(400).send({ error: 'Invalid issue' });
    const note = String((request.body as { note?: string } | undefined)?.note ?? '').trim().slice(0, 1000) || null;
    const user = request.user as { id: number };
    const updated = await prisma.mediaIssue.update({
      where: { id },
      data: { status: 'resolved', resolvedAt: new Date(), resolvedById: user.id, ...(note ? { adminNote: note } : {}) },
      select: { id: true, title: true },
    }).catch(() => null);
    if (!updated) return reply.status(404).send({ error: 'Issue not found' });
    logEvent('info', 'Support', `Issue resolved: "${updated.title}"`);
    return { ok: true };
  });

  app.put('/issues/:id/reopen', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.status(400).send({ error: 'Invalid issue' });
    const updated = await prisma.mediaIssue.update({
      where: { id },
      data: { status: 'open', resolvedAt: null, resolvedById: null },
      select: { id: true },
    }).catch(() => null);
    if (!updated) return reply.status(404).send({ error: 'Issue not found' });
    return { ok: true };
  });

  app.delete('/issues/:id', async (request, reply) => {
    const id = Number((request.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.status(400).send({ error: 'Invalid issue' });
    const deleted = await prisma.mediaIssue.delete({ where: { id } }).catch(() => null);
    if (!deleted) return reply.status(404).send({ error: 'Issue not found' });
    return { ok: true };
  });
}
