/**
 * Admin → Radarr & Sonarr: one place to see and run the *arrs configured in Services.
 *
 * Everything reads the apps' own APIs with the Services config (no extra setup), except restart
 * and update of the container, which go through the optional host helper (hostHelper.ts).
 * Update checks use the app's own update feed, so whatever branch it follows (Sonarr develop,
 * Radarr nightly...) is what "latest" means, and the matching LinuxServer image tag is checked
 * before an update is offered.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../utils/prisma.js';
import { getServiceConfig } from '../utils/services.js';
import { logEvent } from '../utils/logEvent.js';
import { helperCall, helperReady, HelperError } from './hostHelper.js';
import { getZurgConn, zurgGet } from './zurg/client.js';

export type ArrApp = 'sonarr' | 'radarr' | 'prowlarr';
export const ARR_APPS: ArrApp[] = ['sonarr', 'radarr', 'prowlarr'];
const NAMES: Record<ArrApp, string> = { sonarr: 'Sonarr', radarr: 'Radarr', prowlarr: 'Prowlarr' };

export class ArrAdminError extends Error {}

// ─── API access ──────────────────────────────────────────────────────

interface Conn { url: string; apiKey: string; base: string }

async function conn(app: ArrApp): Promise<Conn | null> {
  const cfg = await getServiceConfig(app).catch(() => null);
  if (!cfg?.url || !cfg.apiKey) return null;
  const url = cfg.url.replace(/\/+$/, '');
  return { url, apiKey: cfg.apiKey, base: `${url}/api/${app === 'prowlarr' ? 'v1' : 'v3'}` };
}

export async function call<T>(c: Conn, method: string, path: string, body?: unknown, timeoutMs = 20_000): Promise<T> {
  const res = await fetch(`${c.base}${path}`, {
    method,
    headers: { 'X-Api-Key': c.apiKey, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json() as { message?: string } | { errorMessage?: string }[]; msg = Array.isArray(j) ? j.map((e) => e.errorMessage).join('; ') || msg : j.message ?? msg; } catch { /* keep status */ }
    throw new ArrAdminError(msg);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function need(app: ArrApp): Promise<Conn> {
  const c = await conn(app);
  if (!c) throw new ArrAdminError(`${NAMES[app]} is not set up in Services`);
  return c;
}

// ─── Settings (links) ────────────────────────────────────────────────

const SETTINGS_ID = 'arr-admin';
interface AutoUpdate { enabled: boolean; utcHour: number }
interface Previous { image: string; version: string; at: string }
interface ArrSettings {
  links?: Partial<Record<ArrApp, string>>;
  auto?: Partial<Record<ArrApp, AutoUpdate>>;
  previous?: Partial<Record<ArrApp, Previous>>;
  lastAuto?: Partial<Record<ArrApp, { at: string; result: string }>>;
}
async function writeSettings(s: ArrSettings) {
  const config = JSON.stringify(s);
  await prisma.integration.upsert({ where: { id: SETTINGS_ID }, update: { config }, create: { id: SETTINGS_ID, config } });
}
async function readSettings(): Promise<ArrSettings> {
  const row = await prisma.integration.findUnique({ where: { id: SETTINGS_ID } });
  try { return row ? JSON.parse(row.config) as ArrSettings : {}; } catch { return {}; }
}
export async function getArrSettings() { return { links: (await readSettings()).links ?? {} }; }
export async function saveArrSettings(input: ArrSettings) {
  const links: Partial<Record<ArrApp, string>> = {};
  for (const app of ARR_APPS) {
    const v = input.links?.[app]?.trim();
    if (!v) continue;
    try { const u = new URL(v); if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error(); links[app] = u.toString().replace(/\/+$/, ''); }
    catch { throw new ArrAdminError(`${NAMES[app]} link must be an http(s) address`); }
  }
  await writeSettings({ ...(await readSettings()), links });
  return getArrSettings();
}

// ─── Image tags (LinuxServer on ghcr) ────────────────────────────────

const tagCache = new Map<string, { exists: boolean; at: number }>();
async function imageTagExists(app: ArrApp, tag: string): Promise<boolean | null> {
  const key = `${app}:${tag}`;
  const hit = tagCache.get(key);
  if (hit && Date.now() - hit.at < (hit.exists ? 6 * 3600_000 : 15 * 60_000)) return hit.exists;
  try {
    const tok = await fetch(`https://ghcr.io/token?scope=repository:linuxserver/${app}:pull`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()) as { token?: string };
    const res = await fetch(`https://ghcr.io/v2/linuxserver/${app}/manifests/${encodeURIComponent(tag)}`, {
      method: 'HEAD',
      headers: { Authorization: `Bearer ${tok.token}`, Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json' },
      signal: AbortSignal.timeout(10_000),
    });
    const exists = res.status === 200;
    tagCache.set(key, { exists, at: Date.now() });
    return exists;
  } catch { return null; }
}

/** LinuxServer tag naming per branch: develop-version-X, nightly-version-X, version-X. */
function tagFor(branch: string, version: string) {
  const b = branch.toLowerCase();
  if (b === 'develop') return `develop-version-${version}`;
  if (b === 'nightly') return `nightly-version-${version}`;
  return `version-${version}`;
}

// ─── Overview ────────────────────────────────────────────────────────

interface Update { version: string; branch: string; releaseDate: string; latest: boolean; installed: boolean; installable: boolean; changes?: { new?: string[]; fixed?: string[] } }

const overviewCache = new Map<ArrApp, { at: number; data: unknown }>();
let containersCache: { at: number; data: Record<string, unknown> | null } | null = null;

async function containers(): Promise<Record<string, any> | null> {
  if (containersCache && Date.now() - containersCache.at < 30_000) return containersCache.data;
  let data: Record<string, unknown> | null = null;
  if (await helperReady()) {
    try {
      const r = await helperCall<{ containers: { name: string }[] }>(['containers'], 20_000);
      if (r.ok) data = Object.fromEntries(r.containers.map((c) => [c.name, c]));
    } catch { data = null; }
  }
  containersCache = { at: Date.now(), data };
  return data;
}

export async function appOverview(app: ArrApp, fresh = false) {
  const cached = overviewCache.get(app);
  if (!fresh && cached && Date.now() - cached.at < 20_000) return cached.data;
  const c = await conn(app);
  const settings = await readSettings();
  if (!c) return { app, name: NAMES[app], configured: false };
  const link = settings.links?.[app] ?? c.url;
  let status: Record<string, any>;
  try { status = await call(c, 'GET', '/system/status', undefined, 8_000); }
  catch (err) {
    const data = { app, name: NAMES[app], configured: true, online: false, error: (err as Error).message, link, container: (await containers())?.[app] ?? null };
    overviewCache.set(app, { at: Date.now(), data });
    return data;
  }
  const [updates, health, disks, counts] = await Promise.all([
    call<Update[]>(c, 'GET', '/update').catch(() => [] as Update[]),
    call<{ type: string; source: string; message: string; wikiUrl?: string }[]>(c, 'GET', '/health').catch(() => []),
    app === 'prowlarr' ? Promise.resolve([]) : call<{ path: string; label?: string; freeSpace: number; totalSpace: number }[]>(c, 'GET', '/diskspace').catch(() => []),
    libraryCounts(app, c),
  ]);
  const branch = String(status.branch ?? 'master');
  const installed = String(status.version ?? '');
  const latest = updates.find((u) => u.latest) ?? updates[0] ?? null;
  const updateAvailable = !!latest && latest.version !== installed && compareVersions(latest.version, installed) > 0;
  const newer = updates.filter((u) => compareVersions(u.version, installed) > 0);
  const docker = String(status.packageUpdateMechanism ?? '').toLowerCase() === 'docker' || !!status.isDocker;
  const targetTag = updateAvailable && latest ? tagFor(branch, latest.version) : null;
  const tagReady = targetTag ? await imageTagExists(app, targetTag) : null;
  const container = (await containers())?.[app] ?? null;
  const updateBlocker = whyNoUpdate(container);
  const data = {
    app, name: NAMES[app], configured: true, online: true, link,
    version: installed, branch, docker, packageVersion: status.packageVersion ?? null, startTime: status.startTime ?? null,
    osName: status.osName ?? null, instanceName: status.instanceName ?? NAMES[app],
    update: {
      available: updateAvailable,
      latest: latest ? { version: latest.version, releaseDate: latest.releaseDate } : null,
      behind: newer.length,
      changes: newer.slice(0, 5).map((u) => ({ version: u.version, releaseDate: u.releaseDate, new: u.changes?.new ?? [], fixed: u.changes?.fixed ?? [] })),
      imageTag: targetTag, imageReady: tagReady, blocker: updateBlocker,
    },
    health: health.map((h) => ({ type: h.type, source: h.source, message: h.message, wikiUrl: h.wikiUrl ?? null })),
    // Container paths often share one filesystem; show each filesystem once.
    disks: disks.filter((d, i, all) => d.totalSpace > 0 && all.findIndex((x) => x.totalSpace === d.totalSpace && x.freeSpace === d.freeSpace) === i).map((d) => ({ path: d.path, label: d.label ?? null, free: d.freeSpace, total: d.totalSpace })),
    counts,
    container,
    auto: { ...(settings.auto?.[app] ?? { enabled: false, utcHour: 4 }), last: settings.lastAuto?.[app] ?? null },
    previous: settings.previous?.[app] ?? null,
  };
  overviewCache.set(app, { at: Date.now(), data });
  return data;
}

/** Why LeMedia can't update this container itself (null = it can, given the helper). Updates pin
 *  LinuxServer's tags, so other images are left to their own update method. */
function whyNoUpdate(c: Record<string, any> | null): string | null {
  if (!c) return null; // no helper: the UI points at setting it up instead
  if (c.exists === false) return `The helper can't find a container named ${c.container ?? 'like this app'}`;
  if (c.mode && c.mode !== 'tag') return 'The host helper is set to restart only for this app';
  if (c.compose === false) return 'The container wasn\'t started by Docker Compose, so it\'s updated outside LeMedia';
  if (c.image && !/(^|\/)linuxserver\//.test(String(c.image))) return `Uses ${String(c.image).split('@')[0]}, which LeMedia doesn't update (LinuxServer images only)`;
  return null;
}

function compareVersions(a: string, b: string) {
  const pa = a.split('.').map(Number); const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

const countsCache = new Map<ArrApp, { at: number; data: unknown }>();
async function libraryCounts(app: ArrApp, c: Conn) {
  const hit = countsCache.get(app);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.data;
  const data = await libraryCountsFresh(app, c);
  if (data) countsCache.set(app, { at: Date.now(), data });
  return data;
}

async function libraryCountsFresh(app: ArrApp, c: Conn) {
  try {
    if (app === 'prowlarr') {
      const idx = await call<{ enable: boolean }[]>(c, 'GET', '/indexer');
      return { indexers: idx.length, enabledIndexers: idx.filter((i) => i.enable).length };
    }
    const [missing, queue] = await Promise.all([
      call<{ totalRecords: number }>(c, 'GET', `/wanted/missing?page=1&pageSize=1&monitored=true`),
      call<{ totalRecords: number }>(c, 'GET', '/queue?page=1&pageSize=1'),
    ]);
    // Sonarr's /series and Radarr's /movie are big, hence the 5 minute cache above.
    const items = await call<unknown[]>(c, 'GET', app === 'sonarr' ? '/series' : '/movie', undefined, 30_000);
    return { items: items.length, missing: missing.totalRecords, queue: queue.totalRecords };
  } catch { return null; }
}

export async function overviewAll(fresh = false) {
  const [apps, helper] = await Promise.all([Promise.all(ARR_APPS.map((a) => appOverview(a, fresh))), helperReady()]);
  return { apps, helper };
}

// ─── Jobs (restart / update) ─────────────────────────────────────────

export interface ArrJob { id: string; app: ArrApp; kind: 'restart' | 'update'; status: 'running' | 'done' | 'failed'; phase: string; startedAt: string; finishedAt?: string; error?: string; result?: unknown }
const jobs = new Map<string, ArrJob>();
const busy = new Set<ArrApp>();
export const getArrJob = (id: string) => jobs.get(id) ?? null;
export const activeArrJobs = () => [...jobs.values()].filter((j) => j.status === 'running');

function startJob(app: ArrApp, kind: ArrJob['kind'], work: (j: ArrJob) => Promise<unknown>) {
  if (busy.has(app)) throw new ArrAdminError(`${NAMES[app]} is already restarting or updating`);
  const job: ArrJob = { id: randomUUID(), app, kind, status: 'running', phase: 'Starting', startedAt: new Date().toISOString() };
  jobs.set(job.id, job); busy.add(app);
  void (async () => {
    try { job.result = await work(job); job.status = 'done'; logEvent('info', 'Arr', `${NAMES[app]} ${kind}: ${job.phase}`); }
    catch (err) { job.status = 'failed'; job.error = (err as Error).message; logEvent('warn', 'Arr', `${NAMES[app]} ${kind} failed: ${job.error}`); }
    finally { job.finishedAt = new Date().toISOString(); busy.delete(app); overviewCache.delete(app); containersCache = null; }
  })();
  return job;
}

/** Wait until the app answers again (and, for updates, reports the expected version). */
async function waitOnline(app: ArrApp, job: ArrJob, expectVersion?: string, timeoutMs = 300_000) {
  const c = await need(app);
  const deadline = Date.now() + timeoutMs;
  await new Promise((r) => setTimeout(r, 5_000));
  while (Date.now() < deadline) {
    try {
      const st = await call<{ version: string }>(c, 'GET', '/system/status', undefined, 5_000);
      if (!expectVersion || st.version === expectVersion) return st.version;
      job.phase = `Running ${st.version}, waiting for ${expectVersion}`;
    } catch { /* still starting */ }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new ArrAdminError(`${NAMES[app]} did not come back within ${Math.round(timeoutMs / 60_000)} minutes`);
}

export async function startRestart(app: ArrApp) {
  const c = await need(app);
  const viaHelper = await helperReady();
  return startJob(app, 'restart', async (job) => {
    job.phase = `Restarting ${NAMES[app]}`;
    if (viaHelper) {
      const r = await helperCall(['restart', app], 150_000);
      if (!r.ok) throw new ArrAdminError(r.error ?? 'Restart failed');
    } else {
      // No host access: ask the app to restart itself (its container supervisor brings it back).
      await call(c, 'POST', '/system/restart').catch(() => { /* the connection drops as it goes down */ });
    }
    job.phase = `Waiting for ${NAMES[app]} to come back`;
    const v = await waitOnline(app, job, undefined, 180_000);
    job.phase = `${NAMES[app]} ${v} is back online`;
    return { version: v, via: viaHelper ? 'host helper' : 'app API' };
  });
}

export async function startUpdate(app: ArrApp, source: 'admin' | 'auto' = 'admin') {
  if (!(await helperReady())) throw new ArrAdminError('Updating needs the host helper (Settings tab), because the app can\'t update its own container');
  const ov = await appOverview(app, true) as { online?: boolean; update?: { available: boolean; latest: { version: string } | null; imageTag: string | null; imageReady: boolean | null; blocker?: string | null } };
  if (!ov.online) throw new ArrAdminError(`${NAMES[app]} isn't answering`);
  if (!ov.update?.available || !ov.update.latest || !ov.update.imageTag) throw new ArrAdminError(`${NAMES[app]} is already on the latest version`);
  if (ov.update.blocker) throw new ArrAdminError(ov.update.blocker);
  if (ov.update.imageReady === false) throw new ArrAdminError(`The ${ov.update.imageTag} image isn't published yet; try again later`);
  const { imageTag, latest } = ov.update;
  const before = { image: String((ov as { container?: { image?: string } }).container?.image ?? ''), version: String((ov as { version?: string }).version ?? '') };
  return startJob(app, 'update', async (job) => {
    job.phase = `Pulling ${imageTag} and recreating ${NAMES[app]}`;
    const r = await helperCall<{ image?: string; backup?: string }>(['update', app, imageTag], 900_000);
    if (!r.ok) throw new ArrAdminError(r.error ?? 'Update failed');
    // Remember what was running, for one-click roll back.
    if (before.image) { const st = await readSettings(); await writeSettings({ ...st, previous: { ...st.previous, [app]: { ...before, at: new Date().toISOString() } } }); }
    job.phase = `Waiting for ${NAMES[app]} ${latest.version}`;
    await waitOnline(app, job, latest.version, 420_000);
    job.phase = `Updated to ${latest.version}${source === 'auto' ? ' (automatic)' : ''}`;
    return { version: latest.version, image: r.image, backup: r.backup };
  });
}

/** Go back to the image that ran before the last update (or roll back), pinned by tag or digest. */
export async function startRollback(app: ArrApp) {
  if (!(await helperReady())) throw new ArrAdminError('Rolling back needs the host helper');
  const st = await readSettings();
  const prev = st.previous?.[app];
  if (!prev) throw new ArrAdminError(`There's no earlier ${NAMES[app]} version recorded`);
  const ref = prev.image.includes('@') ? prev.image.split('@')[1] : prev.image.split('/').pop()!.split(':')[1];
  if (!ref) throw new ArrAdminError(`Can't tell which image ${prev.image} was`);
  const ov = await appOverview(app, true) as { version?: string; container?: { image?: string } };
  const now = { image: String(ov.container?.image ?? ''), version: String(ov.version ?? '') };
  return startJob(app, 'update', async (job) => {
    job.phase = `Rolling back to ${prev.version}`;
    const r = await helperCall(['update', app, ref], 900_000);
    if (!r.ok) throw new ArrAdminError(r.error ?? 'Roll back failed');
    // What we just left becomes the roll-back target, so it can be undone.
    if (now.image) { const s2 = await readSettings(); await writeSettings({ ...s2, previous: { ...s2.previous, [app]: { ...now, at: new Date().toISOString() } } }); }
    await waitOnline(app, job, prev.version, 420_000);
    job.phase = `Rolled back to ${prev.version}`;
    return { version: prev.version };
  });
}

export async function setAutoUpdate(app: ArrApp, enabled: boolean, utcHour: number) {
  const h = Math.trunc(Number(utcHour));
  if (!(h >= 0 && h <= 23)) throw new ArrAdminError('Pick an hour');
  const st = await readSettings();
  await writeSettings({ ...st, auto: { ...st.auto, [app]: { enabled: !!enabled, utcHour: h } } });
  overviewCache.delete(app);
}

/** Scheduler (hourly): apps whose update window is this hour get updated when one is out. */
export async function runAutoUpdates(notify: (title: string, message: string) => void) {
  const st = await readSettings();
  const hour = new Date().getUTCHours();
  const due = ARR_APPS.filter((a) => st.auto?.[a]?.enabled && st.auto[a]!.utcHour === hour);
  if (!due.length || !(await helperReady())) return { due: due.length };
  const out: Record<string, string> = {};
  for (const app of due) {
    let result: string;
    try {
      const ov = await appOverview(app, true) as { update?: { available: boolean; blocker?: string | null; imageReady: boolean | null; latest: { version: string } | null } };
      if (!ov.update?.available) result = 'Already up to date';
      else if (ov.update.blocker) result = `Skipped: ${ov.update.blocker}`;
      else if (ov.update.imageReady === false) result = 'Skipped: the image isn\'t published yet';
      else {
        const job = await startUpdate(app, 'auto');
        while (job.status === 'running') await new Promise((r) => setTimeout(r, 5000));
        result = job.status === 'done' ? job.phase : `Failed: ${job.error}`;
        notify(`${NAMES[app]} ${job.status === 'done' ? 'updated' : 'update failed'}`, result);
      }
    } catch (err) { result = `Failed: ${(err as Error).message}`; notify(`${NAMES[app]} update failed`, result); }
    out[app] = result;
    const s2 = await readSettings();
    await writeSettings({ ...s2, lastAuto: { ...s2.lastAuto, [app]: { at: new Date().toISOString(), result } } });
  }
  return out;
}

// ─── Queue, activity, wanted ─────────────────────────────────────────

const mediaTitle = (r: Record<string, any>) => r.series?.title ?? r.movie?.title ?? r.title ?? r.sourceTitle ?? 'Unknown';
const episodeLabel = (r: Record<string, any>) => (r.episode ? `S${String(r.episode.seasonNumber).padStart(2, '0')}E${String(r.episode.episodeNumber).padStart(2, '0')}${r.episode.title ? ` · ${r.episode.title}` : ''}` : null);
const posterOf = (r: Record<string, any>) => {
  const imgs = (r.series ?? r.movie)?.images as { coverType: string; remoteUrl?: string }[] | undefined;
  return imgs?.find((i) => i.coverType === 'poster')?.remoteUrl ?? null;
};

export async function queue(app: 'sonarr' | 'radarr') {
  const c = await need(app);
  const inc = app === 'sonarr' ? 'includeSeries=true&includeEpisode=true' : 'includeMovie=true';
  const data = await call<{ records: Record<string, any>[]; totalRecords: number }>(c, 'GET', `/queue?page=1&pageSize=200&${inc}`);
  return {
    total: data.totalRecords,
    items: data.records.map((r) => ({
      id: r.id, app, title: mediaTitle(r), episode: episodeLabel(r), poster: posterOf(r), release: r.title ?? '',
      quality: r.quality?.quality?.name ?? null, size: Number(r.size) || 0, left: Number(r.sizeleft) || 0,
      status: r.status ?? '', trackedState: r.trackedDownloadState ?? null, trackedStatus: r.trackedDownloadStatus ?? null,
      timeLeft: r.timeleft ?? null, estimatedCompletion: r.estimatedCompletionTime ?? null, protocol: r.protocol ?? null,
      client: r.downloadClient ?? null, indexer: r.indexer ?? null, errorMessage: r.errorMessage ?? null,
      messages: (r.statusMessages ?? []).flatMap((m: { title?: string; messages?: string[] }) => (m.messages?.length ? m.messages : [m.title]).filter(Boolean)),
      added: r.added ?? null,
    })),
  };
}

export async function removeFromQueue(app: 'sonarr' | 'radarr', id: number, blocklist: boolean) {
  const c = await need(app);
  await call(c, 'DELETE', `/queue/${id}?removeFromClient=true&blocklist=${blocklist}`);
}

const EVENT: Record<string, string> = {
  grabbed: 'grabbed', downloadFolderImported: 'imported', downloadFailed: 'failed', episodeFileDeleted: 'deleted', movieFileDeleted: 'deleted',
  episodeFileRenamed: 'renamed', movieFileRenamed: 'renamed', downloadIgnored: 'ignored', importFailed: 'failed',
};

export async function activity(app: 'sonarr' | 'radarr', page = 1) {
  const c = await need(app);
  const inc = app === 'sonarr' ? 'includeSeries=true&includeEpisode=true' : 'includeMovie=true';
  const data = await call<{ records: Record<string, any>[]; totalRecords: number }>(c, 'GET', `/history?page=${page}&pageSize=50&sortKey=date&sortDirection=descending&${inc}`);
  return {
    total: data.totalRecords,
    items: data.records.map((r) => ({
      id: `${app}-${r.id}`, app, kind: EVENT[r.eventType] ?? r.eventType, title: mediaTitle(r), episode: episodeLabel(r), poster: posterOf(r),
      release: r.sourceTitle ?? '', quality: r.quality?.quality?.name ?? null, date: r.date,
      detail: r.data?.message ?? r.data?.reason ?? r.data?.indexer ?? r.data?.downloadClientName ?? null,
    })),
  };
}

export async function wanted(app: 'sonarr' | 'radarr', page = 1) {
  const c = await need(app);
  const inc = app === 'sonarr' ? '&includeSeries=true' : '';
  const sort = app === 'sonarr' ? 'episodes.airDateUtc' : 'movies.sortTitle';
  const dir = app === 'sonarr' ? 'descending' : 'ascending';
  const data = await call<{ records: Record<string, any>[]; totalRecords: number }>(c, 'GET', `/wanted/missing?page=${page}&pageSize=50&monitored=true&sortKey=${sort}&sortDirection=${dir}${inc}`);
  return {
    total: data.totalRecords,
    items: data.records.map((r) => app === 'sonarr'
      ? { id: r.id, app, title: r.series?.title ?? 'Unknown', episode: episodeLabel({ episode: r }), poster: posterOf(r), date: r.airDateUtc ?? null }
      : { id: r.id, app, title: r.title, episode: null, poster: (r.images ?? []).find((i: { coverType: string }) => i.coverType === 'poster')?.remoteUrl ?? null, date: r.digitalRelease ?? r.physicalRelease ?? r.inCinemas ?? null, year: r.year }),
  };
}

export async function searchItems(app: 'sonarr' | 'radarr', ids: number[] | 'all') {
  const c = await need(app);
  const body = ids === 'all'
    ? { name: app === 'sonarr' ? 'MissingEpisodeSearch' : 'MissingMoviesSearch', monitored: true }
    : app === 'sonarr' ? { name: 'EpisodeSearch', episodeIds: ids } : { name: 'MoviesSearch', movieIds: ids };
  await call(c, 'POST', '/command', body);
}

// ─── Logs (console) ──────────────────────────────────────────────────

/** The last lines of an app's log: the container log through the host helper when available,
 *  otherwise the app's own log file through its API. */
export async function logs(app: ArrApp | 'zurg', lines = 300) {
  if (await helperReady()) {
    try {
      const r = await helperCall<{ lines: string[] }>(['logs', app, String(Math.min(2000, lines))], 30_000);
      if (r.ok) return { source: 'container', lines: r.lines };
    } catch (err) { if (!(err instanceof HelperError)) throw err; }
  }
  if (app === 'zurg') {
    // Without the helper: zurg's own /logs/ page (the whole log since it started, so trimmed here).
    const zc = await getZurgConn();
    if (!zc) return { source: 'none', lines: [] as string[] };
    const text = await zurgGet<string>(zc, '/logs/', 30_000);
    return { source: 'zurg', lines: String(text).split('\n').filter(Boolean).slice(-lines) };
  }
  const c = await need(app);
  const files = await call<{ filename: string; contentsUrl?: string }[]>(c, 'GET', '/log/file');
  const first = files[0];
  if (!first) return { source: 'app', lines: [] as string[] };
  const res = await fetch(`${c.url}/api/${app === 'prowlarr' ? 'v1' : 'v3'}/log/file/${encodeURIComponent(first.filename)}`, { headers: { 'X-Api-Key': c.apiKey }, signal: AbortSignal.timeout(20_000) });
  const text = res.ok ? await res.text() : '';
  return { source: 'app', lines: text.split('\n').filter(Boolean).slice(-lines) };
}
