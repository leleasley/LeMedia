/**
 * Admin → Prowlarr: indexers (health, stats, on/off, priority, settings, test), the apps it
 * syncs to, and the search / grab / rate-limit history. Uses the Prowlarr in Services.
 */
import { ArrAdminError, call, need } from './arrAdmin.js';

interface Field { name: string; label?: string; value?: unknown; type?: string; advanced?: boolean; privacy?: string; helpText?: string; selectOptions?: { value: unknown; name: string }[]; hidden?: string }
interface Indexer { id: number; name: string; enable: boolean; priority: number; protocol: string; privacy?: string; definitionName?: string; implementationName?: string; appProfileId?: number; tags?: number[]; fields?: Field[]; indexerUrls?: string[]; added?: string; capabilities?: { categories?: { name: string }[] } }

const EDITABLE = new Set(['textbox', 'number', 'checkbox', 'select', 'password', 'url']);
const editableFields = (fields: Field[] = []) => fields
  .filter((f) => !f.advanced && f.hidden !== 'hidden' && EDITABLE.has(String(f.type)) && f.name !== 'baseUrl')
  .map((f) => ({ name: f.name, label: f.label ?? f.name, type: f.type, value: f.privacy && f.privacy !== 'normal' ? null : f.value ?? null,
    secret: !!f.privacy && f.privacy !== 'normal', helpText: f.helpText ?? null, options: f.selectOptions?.map((o) => ({ value: o.value, name: o.name })) ?? null }));

export async function indexers() {
  const c = await need('prowlarr');
  const [list, statuses, stats] = await Promise.all([
    call<Indexer[]>(c, 'GET', '/indexer'),
    call<{ indexerId: number; disabledTill?: string; mostRecentFailure?: string; initialFailure?: string }[]>(c, 'GET', '/indexerstatus').catch(() => []),
    call<{ indexers?: { indexerId: number; numberOfQueries: number; numberOfGrabs: number; numberOfFailedQueries: number; numberOfFailedGrabs: number; averageResponseTime: number; numberOfRssQueries: number; numberOfAuthQueries: number }[] }>(c, 'GET', '/indexerstats').catch(() => ({ indexers: [] })),
  ]);
  const st = new Map(statuses.map((s) => [s.indexerId, s]));
  const sx = new Map((stats.indexers ?? []).map((s) => [s.indexerId, s]));
  return list.map((i) => {
    const s = st.get(i.id); const x = sx.get(i.id);
    return {
      id: i.id, name: i.name, enable: i.enable, priority: i.priority, protocol: i.protocol, privacy: i.privacy ?? null,
      definition: i.definitionName ?? i.implementationName ?? null, url: i.indexerUrls?.[0] ?? null, added: i.added ?? null,
      status: s ? { disabledTill: s.disabledTill ?? null, mostRecentFailure: s.mostRecentFailure ?? null, initialFailure: s.initialFailure ?? null } : null,
      stats: x ? { queries: x.numberOfQueries, grabs: x.numberOfGrabs, failedQueries: x.numberOfFailedQueries, failedGrabs: x.numberOfFailedGrabs,
        rss: x.numberOfRssQueries, avgMs: x.averageResponseTime } : null,
      fields: editableFields(i.fields),
    };
  }).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

/** Change on/off, priority and plain settings. Secret fields are only replaced when given. */
export async function updateIndexer(id: number, patch: { enable?: boolean; priority?: number; fields?: Record<string, unknown> }) {
  const c = await need('prowlarr');
  const rec = await call<Indexer>(c, 'GET', `/indexer/${id}`);
  if (patch.enable !== undefined) rec.enable = !!patch.enable;
  if (patch.priority !== undefined) {
    const p = Math.trunc(Number(patch.priority));
    if (!(p >= 1 && p <= 50)) throw new ArrAdminError('Priority must be between 1 and 50');
    rec.priority = p;
  }
  if (patch.fields) {
    const allowed = new Set(editableFields(rec.fields).map((f) => f.name));
    for (const f of rec.fields ?? []) {
      if (!(f.name in patch.fields) || !allowed.has(f.name)) continue;
      const v = patch.fields[f.name];
      const secret = !!f.privacy && f.privacy !== 'normal';
      if (secret && (v === null || v === '')) continue;
      f.value = f.type === 'number' ? Number(v) : f.type === 'checkbox' ? !!v : v;
    }
  }
  await call(c, 'PUT', `/indexer/${id}`, rec, 60_000);
}

export async function testIndexer(id: number) {
  const c = await need('prowlarr');
  const rec = await call<Indexer>(c, 'GET', `/indexer/${id}`);
  try { await call(c, 'POST', '/indexer/test', rec, 90_000); return { ok: true, message: null }; }
  catch (err) { return { ok: false, message: (err as Error).message }; }
}

export async function testAll() {
  const c = await need('prowlarr');
  const res = await call<{ id: number; isValid: boolean; validationFailures?: { errorMessage: string }[] }[]>(c, 'POST', '/indexer/testall', {}, 300_000)
    .catch((err) => { throw new ArrAdminError(`Test failed: ${(err as Error).message}`); });
  return (res ?? []).map((r) => ({ id: r.id, ok: r.isValid, message: r.validationFailures?.map((v) => v.errorMessage).join('; ') || null }));
}

export async function applications() {
  const c = await need('prowlarr');
  const apps = await call<{ id: number; name: string; implementationName?: string; syncLevel: string; fields?: Field[] }[]>(c, 'GET', '/applications');
  return apps.map((a) => ({ id: a.id, name: a.name, kind: a.implementationName ?? null, syncLevel: a.syncLevel,
    url: (a.fields?.find((f) => f.name === 'baseUrl')?.value as string | undefined) ?? null }));
}

export async function syncToApps() {
  const c = await need('prowlarr');
  await call(c, 'POST', '/command', { name: 'ApplicationIndexerSync' });
}

const EVENTS: Record<string, string> = { indexerQuery: 'search', indexerRss: 'rss', releaseGrabbed: 'grab', indexerAuth: 'auth', indexerInfo: 'info' };

export async function history(page = 1) {
  const c = await need('prowlarr');
  const [h, list] = await Promise.all([
    call<{ totalRecords: number; records: { id: number; indexerId: number; date: string; eventType: string; successful: boolean; data?: Record<string, string> }[] }>(c, 'GET', `/history?page=${page}&pageSize=50&sortKey=date&sortDirection=descending`),
    call<Indexer[]>(c, 'GET', '/indexer').catch(() => []),
  ]);
  const names = new Map(list.map((i) => [i.id, i.name]));
  return {
    total: h.totalRecords,
    items: h.records.map((r) => ({
      id: r.id, date: r.date, kind: EVENTS[r.eventType] ?? r.eventType, ok: r.successful, indexer: names.get(r.indexerId) ?? `#${r.indexerId}`,
      query: r.data?.query || r.data?.grabTitle || r.data?.title || null, source: r.data?.source ?? null,
      results: r.data?.queryResults ? Number(r.data.queryResults) : null, elapsedMs: r.data?.elapsedTime ? Number(r.data.elapsedTime) : null,
      categories: r.data?.categories ?? null,
    })),
  };
}
