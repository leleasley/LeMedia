import type { FastifyInstance } from 'fastify';
import { prisma } from '../../utils/prisma.js';

export async function logsRoutes(app: FastifyInstance) {
  // === LOGS ===

  app.get('/logs', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'Page number (defaults to 1)' },
          level: { type: 'string', enum: ['info', 'warn', 'error', 'debug'], description: 'Filter logs by level' },
          label: { type: 'string', description: 'Filter logs by label' },
          q: { type: 'string', description: 'Freetext search in the message (max 100 chars)' },
          hideRoutine: { type: 'string', enum: ['0', '1'], description: 'Hide routine cron "Job completed" lines (default off)' },
        },
      },
    },
  }, async (request, reply) => {

    const { page, level, label, q, hideRoutine } = request.query as { page?: string; level?: string; label?: string; q?: string; hideRoutine?: string };
    const pageNum = Number.parseInt(page || '1', 10) || 1;
    const take = 50;
    const skip = (pageNum - 1) * take;
    const where: Record<string, unknown> = {};
    if (level && ['info', 'warn', 'error', 'debug'].includes(level)) where.level = level;
    if (label) where.label = label;
    // Bounded freetext search — LIKE on a non-indexed column, capped length so a
    // pathological query can't turn the admin log viewer into a full-table scan timer.
    const needle = (q || '').trim().slice(0, 100);
    if (needle) where.message = { contains: needle };
    // The 30-minute jobs write a line per run and swamp everything else (61% of this instance's
    // log). Hidden by default in the UI, but an explicit Job filter always shows them.
    if (hideRoutine === '1' && !label) where.NOT = { label: 'Job', level: 'info' };

    // Facets ignore their own filter (picking a label must not hide the other labels), so the
    // chips stay stable while paging and searching.
    const labelWhere = { ...where } as Record<string, unknown>;
    delete labelWhere.label;
    const levelWhere = { ...where } as Record<string, unknown>;
    delete levelWhere.level;

    const [logs, total, labelGroups, levelGroups] = await Promise.all([
      prisma.appLog.findMany({ where, orderBy: { createdAt: 'desc' }, take, skip }),
      prisma.appLog.count({ where }),
      prisma.appLog.groupBy({ by: ['label'], where: labelWhere, _count: { _all: true } }),
      prisma.appLog.groupBy({ by: ['level'], where: levelWhere, _count: { _all: true } }),
    ]);

    const labels = labelGroups
      .map((g) => ({ label: g.label, count: g._count._all }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 40);
    const levels: Record<string, number> = { info: 0, warn: 0, error: 0, debug: 0 };
    for (const g of levelGroups) levels[g.level] = g._count._all;

    return { results: logs, total, page: pageNum, totalPages: Math.ceil(total / take), facets: { labels, levels } };
  });

  app.delete('/logs', async (request, reply) => {

    await prisma.appLog.deleteMany();
    return { ok: true };
  });
}
