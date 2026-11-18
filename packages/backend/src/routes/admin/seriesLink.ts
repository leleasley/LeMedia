import type { FastifyInstance, FastifyReply } from 'fastify';
import { SeriesLinkError, linkSeries, linkState, searchSeries, unlinkSeries } from '../../services/seriesLink.js';

const id = (value: unknown): number | null => {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

async function run<T>(reply: FastifyReply, fn: () => Promise<T> | T) {
  try { return await fn(); }
  catch (err) {
    if (err instanceof SeriesLinkError) return reply.status(err.statusCode).send({ error: err.message });
    throw err;
  }
}

/**
 * Admin → link a TMDB row to the Sonarr series it really is.
 *
 * Exists because TMDB and TVDB disagree about split shows (Top Boy 2011 vs 2019): Sonarr's
 * lookup answers `tmdb:<id>` with an empty list, so requests for the newer TMDB id failed forever.
 * The link is stored on Media.tvdbId and outranks the TMDB mapping for dispatch and sync.
 */
export async function seriesLinkRoutes(app: FastifyInstance) {
  app.get('/series-link/candidates', { schema: { querystring: { type: 'object', required: ['term'], properties: {
    term: { type: 'string', minLength: 1, maxLength: 200 },
    tmdbId: { type: 'string', pattern: '^[0-9]{1,12}$' },
  } } } }, async (request, reply) => run(reply, () => {
    const q = request.query as { term: string; tmdbId?: string };
    return searchSeries(q.term, id(q.tmdbId));
  }));

  app.get('/series-link', async (request, reply) => {
    const tmdbId = id((request.query as { tmdbId?: string }).tmdbId);
    if (!tmdbId) return reply.status(400).send({ error: 'tmdbId is required' });
    return linkState(tmdbId);
  });

  app.post('/series-link', { schema: { body: { type: 'object', required: ['tmdbId', 'tvdbId'], properties: {
    tmdbId: { type: 'integer', minimum: 1 },
    tvdbId: { type: 'integer', minimum: 1 },
  } } } }, async (request, reply) => run(reply, () => {
    const body = request.body as { tmdbId: number; tvdbId: number };
    return linkSeries(body.tmdbId, body.tvdbId);
  }));

  app.delete('/series-link/:tmdbId', async (request, reply) => run(reply, async () => {
    const tmdbId = id((request.params as { tmdbId: string }).tmdbId);
    if (!tmdbId) return reply.status(400).send({ error: 'Invalid tmdbId' });
    await unlinkSeries(tmdbId);
    return { ok: true };
  }));
}
