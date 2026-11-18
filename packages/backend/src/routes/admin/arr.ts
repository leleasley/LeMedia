import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ARR_APPS, ArrAdminError, activeArrJobs, activity, getArrJob, getArrSettings, logs, overviewAll, queue, removeFromQueue,
  saveArrSettings, searchItems, setAutoUpdate, startRestart, startRollback, startUpdate, wanted, exclusions, removeExclusion, type ArrApp,
} from '../../services/arrAdmin.js';
import { applications, history as prowlarrHistory, indexers, syncToApps, testAll, testIndexer, updateIndexer } from '../../services/prowlarrAdmin.js';
import { DEFAULT_HELPER_APPS, HelperError, clearHelper, createInstallToken, generateKey, helperStatus, setTarget, testHelper } from '../../services/hostHelper.js';

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object' as const, properties, required });

async function run<T>(reply: FastifyReply, fn: () => Promise<T> | T) {
  try { return await fn(); }
  catch (err) {
    if (err instanceof ArrAdminError || err instanceof HelperError) return reply.status(400).send({ error: err.message });
    throw err;
  }
}

const appOf = (v: string, withProwlarr = true): ArrApp => {
  if (!ARR_APPS.includes(v as ArrApp) || (!withProwlarr && v === 'prowlarr')) throw new ArrAdminError('Unknown app');
  return v as ArrApp;
};
const libApp = (v: string) => appOf(v, false) as 'sonarr' | 'radarr';

/** Admin → Radarr & Sonarr. */
export async function arrAdminRoutes(app: FastifyInstance) {
  app.get('/arr/overview', async (request) => ({ ...(await overviewAll((request.query as { fresh?: string }).fresh === '1')), jobs: activeArrJobs() }));

  app.post('/arr/:app/restart', async (request, reply) => run(reply, async () => ({ jobId: (await startRestart(appOf((request.params as { app: string }).app))).id })));
  app.post('/arr/:app/update', async (request, reply) => run(reply, async () => ({ jobId: (await startUpdate(appOf((request.params as { app: string }).app))).id })));
  app.post('/arr/:app/rollback', async (request, reply) => run(reply, async () => ({ jobId: (await startRollback(appOf((request.params as { app: string }).app))).id })));
  app.put('/arr/:app/auto', { schema: { body: obj({ enabled: { type: 'boolean' }, utcHour: { type: 'integer', minimum: 0, maximum: 23 } }, ['enabled', 'utcHour']) } },
    async (request, reply) => run(reply, async () => {
      const b = request.body as { enabled: boolean; utcHour: number };
      await setAutoUpdate(appOf((request.params as { app: string }).app), b.enabled, b.utcHour);
      return { ok: true };
    }));
  app.get('/arr/jobs/:id', async (request, reply) => getArrJob((request.params as { id: string }).id) ?? reply.status(404).send({ error: 'NOT_FOUND' }));

  app.get('/arr/:app/queue', async (request, reply) => run(reply, () => queue(libApp((request.params as { app: string }).app))));
  app.delete('/arr/:app/queue/:id', async (request, reply) => run(reply, async () => {
    const p = request.params as { app: string; id: string };
    await removeFromQueue(libApp(p.app), Number(p.id), (request.query as { blocklist?: string }).blocklist === '1');
    return { ok: true };
  }));
  app.get('/arr/:app/activity', async (request, reply) => run(reply, () => activity(libApp((request.params as { app: string }).app), Number((request.query as { page?: string }).page) || 1)));
  app.get('/arr/:app/wanted', async (request, reply) => run(reply, () => wanted(libApp((request.params as { app: string }).app), Number((request.query as { page?: string }).page) || 1)));
  app.get('/arr/:app/exclusions', async (request, reply) => run(reply, () => exclusions(libApp((request.params as { app: string }).app))));
  app.delete('/arr/:app/exclusions/:id', async (request, reply) => run(reply, async () => {
    const p = request.params as { app: string; id: string };
    await removeExclusion(libApp(p.app), Number(p.id));
    return { ok: true };
  }));
  app.post('/arr/:app/search', {
    schema: { body: obj({ ids: { type: 'array', items: { type: 'integer' }, maxItems: 500 }, all: { type: 'boolean' } }) },
  }, async (request, reply) => run(reply, async () => {
    const b = request.body as { ids?: number[]; all?: boolean };
    await searchItems(libApp((request.params as { app: string }).app), b.all ? 'all' : (b.ids ?? []));
    return { ok: true };
  }));
  app.get('/arr/:app/logs', async (request, reply) => run(reply, () => {
    const a = (request.params as { app: string }).app;
    return logs(a === 'zurg' ? 'zurg' : appOf(a), Number((request.query as { lines?: string }).lines) || 300);
  }));

  // ─── Prowlarr ───
  app.get('/prowlarr/indexers', async (request, reply) => run(reply, () => indexers()));
  app.patch('/prowlarr/indexers/:id', {
    schema: { body: obj({ enable: { type: 'boolean' }, priority: { type: 'integer' }, fields: { type: 'object' } }) },
  }, async (request, reply) => run(reply, async () => {
    await updateIndexer(Number((request.params as { id: string }).id), request.body as { enable?: boolean; priority?: number; fields?: Record<string, unknown> });
    return { ok: true };
  }));
  app.post('/prowlarr/indexers/:id/test', async (request, reply) => run(reply, () => testIndexer(Number((request.params as { id: string }).id))));
  app.post('/prowlarr/indexers/test-all', async (request, reply) => run(reply, () => testAll()));
  app.get('/prowlarr/apps', async (request, reply) => run(reply, () => applications()));
  app.post('/prowlarr/apps/sync', async (request, reply) => run(reply, async () => { await syncToApps(); return { ok: true }; }));
  app.get('/prowlarr/history', async (request, reply) => run(reply, () => prowlarrHistory(Number((request.query as { page?: string }).page) || 1)));

  app.get('/arr/settings', async () => ({ ...(await getArrSettings()), helper: await helperStatus() }));
  app.put('/arr/settings', { schema: { body: obj({ links: { type: 'object' } }) } }, async (request, reply) => run(reply, () => saveArrSettings(request.body as { links?: Partial<Record<ArrApp, string>> })));

  app.post('/arr/helper/key', async (request, reply) => run(reply, () => generateKey()));
  app.put('/arr/helper', {
    schema: { body: obj({ host: { type: 'string', maxLength: 253 }, port: { type: 'integer' }, user: { type: 'string', maxLength: 32 } }, ['host']) },
  }, async (request, reply) => run(reply, () => setTarget(request.body as { host: string; port?: number; user?: string })));
  app.get('/arr/helper/defaults', async () => ({ apps: DEFAULT_HELPER_APPS }));
  app.post('/arr/helper/install', { schema: { body: obj({ apps: { type: 'object' } }, ['apps']) } },
    async (request, reply) => run(reply, () => createInstallToken((request.body as { apps: Record<string, { container?: string; mode?: string }> }).apps)));
  app.post('/arr/helper/test', async (request, reply) => run(reply, () => testHelper()));
  app.delete('/arr/helper', async () => { await clearHelper(); return { ok: true }; });
}
