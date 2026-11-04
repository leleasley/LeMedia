import type { FastifyInstance, FastifyReply } from 'fastify';
import {
  ListError, addToCustomList, adoptArrList, arrImportLists, arrChoices, createCustomList, deleteCustomList, deleteSubscription, getJob, getListsSettings,
  getPreview, importMediaHealSubscriptions, listCustomLists, listJobs, listSubscriptions, removeFromCustomList, renameCustomList,
  saveListsSettings, startAdd, tidySubscriptionNames, startPreview, startRetry, startSyncNow, updateSubscription, type AddSettings,
} from '../../services/lists/engine.js';
import { prisma } from '../../utils/prisma.js';
import { importWweState, pinEvent, saveWweSettings, unpinEvent, wweStatus } from '../../services/lists/wwe.js';

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object' as const, properties, required });
const settingsSchema = obj({
  search: { type: 'boolean' }, onlyNew: { type: 'boolean' },
  radarrProfileId: { type: 'integer' }, radarrRoot: { type: 'string', maxLength: 500 },
  sonarrProfileId: { type: 'integer' }, sonarrRoot: { type: 'string', maxLength: 500 },
});

/** Turn a readable ListError into a 400; anything else stays a 500. */
async function run<T>(reply: FastifyReply, fn: () => Promise<T> | T) {
  try { return await fn(); }
  catch (err) {
    if (err instanceof ListError) return reply.status(400).send({ error: err.message });
    throw err;
  }
}

/** Admin → Lists: list links and handmade lists that feed Radarr and Sonarr. */
export async function listsAdminRoutes(app: FastifyInstance) {
  // Old auto-generated list names become the list's real title (names someone chose are kept).
  setTimeout(() => void tidySubscriptionNames().catch(() => {}), 30_000).unref();

  app.get('/lists/settings', async () => getListsSettings());

  app.put('/lists/settings', {
    schema: { body: obj({
      filters: { type: 'object' }, syncIntervalHours: { type: 'integer', minimum: 1, maximum: 168 }, defaults: settingsSchema,
      traktClientId: { type: ['string', 'null'], maxLength: 200 }, mdblistApiKey: { type: ['string', 'null'], maxLength: 200 },
    }) },
  }, async (request) => saveListsSettings(request.body as Parameters<typeof saveListsSettings>[0]));

  app.get('/lists/arr', async () => arrChoices());

  app.post('/lists/preview', { schema: { body: obj({ url: { type: 'string', minLength: 1, maxLength: 2000 } }, ['url']) } },
    async (request, reply) => run(reply, () => ({ jobId: startPreview((request.body as { url: string }).url.trim()).id })));

  app.get('/lists/preview/:id', async (request, reply) => {
    const p = getPreview((request.params as { id: string }).id);
    return p ?? reply.status(404).send({ error: 'This preview has expired; preview the list again' });
  });

  app.post('/lists/add', {
    schema: { body: obj({
      previewId: { type: 'string', maxLength: 64 }, keys: { type: 'array', items: { type: 'string', maxLength: 200 }, maxItems: 5000 },
      settings: settingsSchema, subscribe: { type: 'boolean' }, name: { type: 'string', maxLength: 120 },
    }, ['previewId', 'keys', 'settings']) },
  }, async (request, reply) => {
    const b = request.body as { previewId: string; keys: string[]; settings: AddSettings; subscribe?: boolean; name?: string };
    return run(reply, () => ({ jobId: startAdd(b.previewId, b.keys, b.settings, !!b.subscribe, b.name).id }));
  });

  app.get('/lists/jobs', async () => listJobs().slice(0, 10));
  app.get('/lists/jobs/:id', async (request, reply) => getJob((request.params as { id: string }).id) ?? reply.status(404).send({ error: 'NOT_FOUND' }));

  // ─── Subscriptions ───
  app.get('/lists/subscriptions', async () => listSubscriptions());

  const subUrl = async (id: number) => (await prisma.listSubscription.findUnique({ where: { id }, select: { url: true } }))?.url;

  app.patch('/lists/subscriptions/:id', {
    schema: { body: obj({ enabled: { type: 'boolean' }, name: { type: 'string', maxLength: 120 }, settings: settingsSchema }) },
  }, async (request, reply) => run(reply, async () => {
    await updateSubscription(Number((request.params as { id: string }).id), request.body as Parameters<typeof updateSubscription>[1]);
    return { ok: true };
  }));

  app.delete('/lists/subscriptions/:id', async (request, reply) => run(reply, async () => {
    await deleteSubscription(Number((request.params as { id: string }).id));
    return { ok: true };
  }));

  app.post('/lists/subscriptions/:id/sync', async (request, reply) => run(reply, async () => {
    const url = await subUrl(Number((request.params as { id: string }).id));
    if (!url) throw new ListError('List subscription not found');
    return { jobId: startSyncNow(url).id };
  }));

  app.post('/lists/subscriptions/:id/retry', async (request, reply) => run(reply, async () => {
    const url = await subUrl(Number((request.params as { id: string }).id));
    if (!url) throw new ListError('List subscription not found');
    return { jobId: startRetry(url).id };
  }));

  // One-off move from media-heal: body is its dmm-list-subscriptions.json.
  app.post('/lists/subscriptions/import', {
    bodyLimit: 4 * 1024 * 1024,
    schema: { body: obj({ payload: { type: 'object' }, overwrite: { type: 'boolean' }, paused: { type: 'boolean' } }, ['payload']) },
  }, async (request, reply) => run(reply, () => {
    const b = request.body as { payload: unknown; overwrite?: boolean; paused?: boolean };
    return importMediaHealSubscriptions(b.payload, !!b.overwrite, !!b.paused);
  }));

  // ─── Lists defined inside Radarr / Sonarr ───
  app.get('/lists/arr-lists', async () => arrImportLists());
  app.post('/lists/arr-lists/adopt', {
    schema: { body: obj({ app: { type: 'string', enum: ['radarr', 'sonarr'] }, id: { type: 'integer' }, enabled: { type: 'boolean' } }, ['app', 'id']) },
  }, async (request, reply) => run(reply, () => {
    const b = request.body as { app: 'radarr' | 'sonarr'; id: number; enabled?: boolean };
    return adoptArrList(b.app, b.id, b.enabled !== false);
  }));

  // ─── WWE events (wwe:events) ───
  app.get('/lists/wwe', async () => wweStatus());
  app.put('/lists/wwe/settings', { schema: { body: { type: 'object' as const } } }, async (request) => saveWweSettings(request.body));
  app.post('/lists/wwe/pins', {
    schema: { body: obj({ sourceId: { type: 'string', maxLength: 40 }, target: { type: 'string', maxLength: 300 } }, ['sourceId', 'target']) },
  }, async (request, reply) => run(reply, () => {
    const b = request.body as { sourceId: string; target: string };
    return pinEvent(b.sourceId, b.target);
  }));
  app.delete('/lists/wwe/pins/:sourceId', async (request) => {
    await unpinEvent((request.params as { sourceId: string }).sourceId);
    return { ok: true };
  });
  // One-off move from media-heal: body is its wwe-events.json (match cache, pins, settings).
  app.post('/lists/wwe/import', { bodyLimit: 8 * 1024 * 1024, schema: { body: { type: 'object' as const } } },
    async (request, reply) => run(reply, () => importWweState(request.body)));

  // ─── Handmade lists ───
  app.get('/lists/custom', async () => listCustomLists());

  app.post('/lists/custom', { schema: { body: obj({ name: { type: 'string', minLength: 1, maxLength: 120 } }, ['name']) } },
    async (request, reply) => run(reply, () => createCustomList((request.body as { name: string }).name)));

  app.patch('/lists/custom/:id', { schema: { body: obj({ name: { type: 'string', minLength: 1, maxLength: 120 } }, ['name']) } },
    async (request, reply) => run(reply, async () => {
      await renameCustomList((request.params as { id: string }).id, (request.body as { name: string }).name);
      return { ok: true };
    }));

  app.delete('/lists/custom/:id', async (request, reply) => run(reply, async () => {
    await deleteCustomList((request.params as { id: string }).id);
    return { ok: true };
  }));

  app.post('/lists/custom/:id/items', {
    schema: { body: obj({ tmdbId: { type: 'integer', minimum: 1 }, type: { type: 'string', enum: ['movie', 'tv'] } }, ['tmdbId', 'type']) },
  }, async (request, reply) => run(reply, () => {
    const b = request.body as { tmdbId: number; type: 'movie' | 'tv' };
    return addToCustomList((request.params as { id: string }).id, b.tmdbId, b.type);
  }));

  app.delete('/lists/custom/:id/items', { schema: { body: obj({ key: { type: 'string', maxLength: 200 } }, ['key']) } },
    async (request, reply) => run(reply, async () => {
      await removeFromCustomList((request.params as { id: string }).id, (request.body as { key: string }).key);
      return { ok: true };
    }));
}
