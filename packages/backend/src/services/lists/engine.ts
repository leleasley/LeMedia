/**
 * Admin → Lists engine: preview a list against Radarr/Sonarr, add the chosen titles by exact ID,
 * and keep subscribed lists in sync. A port of media-heal's list bridge (dmm_lists.py +
 * the subscription loop in dashboard.py), so a list behaves the same here as it did there.
 *
 * Nothing is ever deleted or changed in the *arrs: titles already there are skipped, and every
 * add goes through the content filters twice (on the list's own data, then on the *arr record).
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../utils/prisma.js';
import { getArrClient } from '../../providers/index.js';
import type { RadarrClient } from '../../providers/radarr/client.js';
import type { SonarrClient } from '../../providers/sonarr/client.js';
import { decryptSecretValue, encryptSecretValue } from '../../utils/secrets.js';
import { logEvent } from '../../utils/logEvent.js';
import { getTmdbApi } from '../tmdb.js';
import { fetchListItems, fetchListTitle, ListError, MAX_IMPORT_ITEMS, parseListUrl, type ItemType, type ListItem, type ListSource } from './sources.js';
import { DEFAULT_FILTERS, filterReason, normalizeFilters, type ListFilters } from './filters.js';
import { fetchWweItems, WWE_LABEL, WWE_URL, type WweListItem } from './wwe.js';
import { notifyListAdded } from '../stackWatch.js';
import { selectedDmmService, sendToDmm } from '../dmm.js';

const WORKERS = 3;
const HISTORY_MAX = 50;

// ─── Settings ────────────────────────────────────────────────────────

export interface AddSettings {
  search: boolean;
  onlyNew?: boolean;
  radarrProfileId?: number;
  radarrRoot?: string;
  sonarrProfileId?: number;
  sonarrRoot?: string;
}

interface StoredConfig {
  filters?: unknown;
  traktClientId?: string; // encrypted
  mdblistApiKey?: string; // encrypted
  syncIntervalHours?: number;
  defaults?: Partial<AddSettings>;
}

const CONFIG_ID = 'lists';

async function readConfig(): Promise<StoredConfig> {
  const row = await prisma.integration.findUnique({ where: { id: CONFIG_ID } });
  try { return row ? JSON.parse(row.config) as StoredConfig : {}; } catch { return {}; }
}

async function writeConfig(cfg: StoredConfig) {
  const config = JSON.stringify(cfg);
  await prisma.integration.upsert({ where: { id: CONFIG_ID }, update: { config }, create: { id: CONFIG_ID, config } });
}

export async function getFilters(): Promise<ListFilters> { return normalizeFilters((await readConfig()).filters ?? DEFAULT_FILTERS); }
async function getKeys() {
  const cfg = await readConfig();
  return { traktClientId: decryptSecretValue(cfg.traktClientId), mdblistApiKey: decryptSecretValue(cfg.mdblistApiKey) };
}
/** Server-side access to the shared MDBList key; never returned to clients. */
export async function getMdblistApiKey(): Promise<string | null> { return decryptSecretValue((await readConfig()).mdblistApiKey) || null; }
export async function syncIntervalHours() { return Math.min(168, Math.max(1, Number((await readConfig()).syncIntervalHours) || 6)); }

/** Settings for the admin page. Keys are never sent back, only whether they're set. */
export async function getListsSettings() {
  const cfg = await readConfig();
  return {
    filters: normalizeFilters(cfg.filters ?? DEFAULT_FILTERS),
    syncIntervalHours: await syncIntervalHours(),
    defaults: cfg.defaults ?? {},
    traktClientIdSet: !!decryptSecretValue(cfg.traktClientId),
    mdblistApiKeySet: !!decryptSecretValue(cfg.mdblistApiKey),
  };
}

export async function saveListsSettings(input: { filters?: unknown; syncIntervalHours?: number; defaults?: Partial<AddSettings>; traktClientId?: string | null; mdblistApiKey?: string | null }) {
  const cfg = await readConfig();
  if (input.filters !== undefined) cfg.filters = normalizeFilters(input.filters);
  if (input.syncIntervalHours !== undefined) cfg.syncIntervalHours = Math.min(168, Math.max(1, Math.round(Number(input.syncIntervalHours) || 6)));
  if (input.defaults !== undefined) cfg.defaults = cleanSettings(input.defaults);
  // A key: a string sets it, null clears it, undefined leaves it.
  if (input.traktClientId !== undefined) cfg.traktClientId = input.traktClientId ? encryptSecretValue(input.traktClientId.trim()) ?? undefined : undefined;
  if (input.mdblistApiKey !== undefined) cfg.mdblistApiKey = input.mdblistApiKey ? encryptSecretValue(input.mdblistApiKey.trim()) ?? undefined : undefined;
  await writeConfig(cfg);
  return getListsSettings();
}

function cleanSettings(s: Partial<AddSettings> | undefined): AddSettings {
  const num = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);
  const txt = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  return {
    search: !!s?.search,
    onlyNew: !!s?.onlyNew,
    radarrProfileId: num(s?.radarrProfileId),
    radarrRoot: txt(s?.radarrRoot),
    sonarrProfileId: num(s?.sonarrProfileId),
    sonarrRoot: txt(s?.sonarrRoot),
  };
}

// ─── *arr access ─────────────────────────────────────────────────────

async function radarr(): Promise<RadarrClient | null> { return (await getArrClient('radarr').catch(() => null)) as RadarrClient | null; }
async function sonarr(): Promise<SonarrClient | null> { return (await getArrClient('sonarr').catch(() => null)) as SonarrClient | null; }

const clientFor = (t: ItemType) => (t === 'movie' ? radarr() : sonarr());

/** Quality profiles and root folders, for the add form. */
export async function arrChoices() {
  const one = async (c: RadarrClient | SonarrClient | null) => {
    if (!c) return null;
    try {
      const [profiles, roots] = await Promise.all([c.getQualityProfiles(), c.getRootFolders()]);
      return {
        profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
        roots: roots.map((r) => ({ path: r.path, accessible: (r as { accessible?: boolean }).accessible !== false })),
      };
    } catch { return null; }
  };
  const [r, s] = await Promise.all([radarr(), sonarr()]);
  const [movie, show] = await Promise.all([one(r), one(s)]);
  const dmm = await selectedDmmService();
  return { movie, show, dmm: dmm ? { id: dmm.id, name: dmm.name } : null };
}

interface Library { primary: Set<string>; imdb: Set<string> }

async function loadLibrary(t: ItemType): Promise<Library | null> {
  if (t === 'movie') {
    const c = await radarr();
    if (!c) return null;
    const rows = await c.getMovies();
    return { primary: new Set(rows.map((m) => String(m.tmdbId ?? '')).filter(Boolean)), imdb: new Set(rows.map((m) => String((m as { imdbId?: string }).imdbId ?? '')).filter(Boolean)) };
  }
  const c = await sonarr();
  if (!c) return null;
  const rows = await c.getSeries();
  return { primary: new Set(rows.map((s) => String(s.tvdbId ?? '')).filter(Boolean)), imdb: new Set(rows.map((s) => String((s as { imdbId?: string }).imdbId ?? '')).filter(Boolean)) };
}

const normTitle = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** When requests go to DMM there may be no Radarr/Sonarr at all; treat a title LeMedia already
 *  shows as available as "in the library" so a list sync doesn't re-send it every time. */
async function loadLocalLibrary(t: ItemType): Promise<Library> {
  const rows = await prisma.media.findMany({
    where: { mediaType: t === 'movie' ? 'movie' : 'tv', statusCategory: 'AVAILABLE' },
    select: { tmdbId: true, tvdbId: true },
  });
  return {
    primary: new Set(rows.map((r) => String(t === 'movie' ? r.tmdbId : r.tvdbId ?? '')).filter(Boolean)),
    imdb: new Set(),
  };
}

/** TMDB id for a list item, resolving from IMDb/TVDB when the source didn't carry one. */
async function tmdbIdFor(item: ListItem): Promise<number | null> {
  if (item.ids.tmdb) return Number(item.ids.tmdb);
  const api = getTmdbApi();
  const find = async (id: string, source: 'imdb_id' | 'tvdb_id') => {
    try {
      const { data } = await api.get(`/find/${encodeURIComponent(id)}`, { params: { external_source: source } });
      const hit = item.mediaType === 'movie' ? data?.movie_results?.[0] : data?.tv_results?.[0];
      return hit?.id ? Number(hit.id) : null;
    } catch { return null; }
  };
  if (item.ids.imdb) { const id = await find(String(item.ids.imdb), 'imdb_id'); if (id) return id; }
  if (item.mediaType === 'show' && item.ids.tvdb) return find(String(item.ids.tvdb), 'tvdb_id');
  return null;
}

// ─── Preview ─────────────────────────────────────────────────────────

export interface Preview {
  id: string;
  source: { url: string; label: string; provider: string; providerName: string; mediaType: ItemType | 'mixed'; resolver: string };
  items: ListItem[];
  counts: { total: number; existing: number; missing: number; blocked: number };
  arrMissing: ItemType[];
  createdAt: number;
}

const previews = new Map<string, Preview>();
const PREVIEW_TTL = 60 * 60_000;
function keepPreview(p: Preview) {
  const now = Date.now();
  for (const [id, old] of previews) if (now - old.createdAt > PREVIEW_TTL) previews.delete(id);
  previews.set(p.id, p);
}
export function getPreview(id: string) { return previews.get(id) ?? null; }

/** Mark each item as already in the library, blocked (with a reason) or new. */
async function annotate(items: ListItem[], filters: ListFilters): Promise<{ counts: Preview['counts']; arrMissing: ItemType[] }> {
  const dmm = await selectedDmmService();
  const types = new Set(items.map((i) => i.mediaType));
  const libs: Partial<Record<ItemType, Library | null>> = {};
  const arrMissing: ItemType[] = [];
  let sonarrExcluded = new Set<string>();
  let radarrExcluded = { tmdb: new Set<string>(), titleYear: new Set<string>() };
  if (types.has('movie')) {
    libs.movie = await loadLibrary('movie');
    if (!libs.movie && dmm) libs.movie = await loadLocalLibrary('movie');
    else if (!libs.movie) arrMissing.push('movie');
    const ex = await (await radarr())?.getExclusions().catch(() => []) ?? [];
    radarrExcluded = {
      tmdb: new Set(ex.map((e) => String(e.tmdbId ?? '')).filter(Boolean)),
      titleYear: new Set(ex.filter((e) => e.movieTitle && e.movieYear).map((e) => `${normTitle(e.movieTitle)}|${e.movieYear}`)),
    };
  }
  if (types.has('show')) {
    libs.show = await loadLibrary('show');
    if (!libs.show && dmm) libs.show = await loadLocalLibrary('show');
    else if (!libs.show) arrMissing.push('show');
    const ex = await (await sonarr())?.getImportListExclusions().catch(() => []) ?? [];
    sonarrExcluded = new Set(ex.map((e) => String(e.tvdbId ?? '')).filter(Boolean));
  }
  const blacklist = await prisma.blacklistedMedia.findMany({ select: { tmdbId: true, mediaType: true } });
  const black = new Set(blacklist.map((b) => `${b.mediaType}:${b.tmdbId}`));

  for (const item of items) {
    const lib = libs[item.mediaType];
    const primary = String((item.mediaType === 'show' ? item.ids.tvdb : item.ids.tmdb) ?? '');
    const imdb = String(item.ids.imdb ?? '');
    item.existing = !!lib && ((!!primary && lib.primary.has(primary)) || (!!imdb && lib.imdb.has(imdb)));
    let reason: string | null = null;
    if (!lib) reason = item.mediaType === 'movie' ? 'Radarr is not set up' : 'Sonarr is not set up';
    else if (item.mediaType === 'show' && primary && sonarrExcluded.has(primary)) reason = 'On Sonarr\'s exclusion list';
    else if (item.mediaType === 'movie' && ((primary && radarrExcluded.tmdb.has(primary)) || (item.year && radarrExcluded.titleYear.has(`${normTitle(item.title)}|${item.year}`)))) reason = 'On Radarr\'s exclusion list';
    else if (item.ids.tmdb && black.has(`${item.mediaType === 'show' ? 'tv' : 'movie'}:${item.ids.tmdb}`)) reason = 'On the LeMedia blacklist';
    else { const f = filterReason(item, filters); if (f) reason = `Filtered: ${f}`; }
    // A source can pre-block a row it couldn't match exactly (WWE review rows): shown, never added.
    if (!reason && (item as WweListItem).presetBlock) reason = (item as WweListItem).presetBlock!;
    item.blocked = !!reason;
    if (reason) item.blockReason = reason; else delete item.blockReason;
  }
  return {
    counts: {
      total: items.length,
      existing: items.filter((i) => i.existing).length,
      missing: items.filter((i) => !i.existing && !i.blocked).length,
      blocked: items.filter((i) => !i.existing && i.blocked).length,
    },
    arrMissing,
  };
}

/** Read a list (link or `custom:<id>`) and annotate it against the *arrs. */
export async function buildPreview(url: string): Promise<Preview> {
  let source: Preview['source'];
  let items: ListItem[];
  if (url.startsWith('custom:')) {
    const list = await prisma.customList.findUnique({ where: { id: url.slice(7) } });
    if (!list) throw new ListError('Handmade list not found');
    items = parseJson<ListItem[]>(list.items, []).map((i, rank) => ({ ...i, feeds: [list.name], appearances: 1, rank }));
    const types = new Set(items.map((i) => i.mediaType));
    source = { url, label: list.name, provider: 'custom', providerName: 'Handmade list', mediaType: types.size === 1 ? [...types][0] : 'mixed', resolver: 'Titles picked by hand' };
  } else {
    if (url === WWE_URL) {
      const fetched = await fetchWweItems();
      items = fetched.items;
      source = { url: WWE_URL, label: WWE_LABEL, provider: 'wwe', providerName: 'WWE events', mediaType: 'movie', resolver: fetched.resolver };
      const { counts, arrMissing } = await annotate(items, await getFilters());
      const preview: Preview = { id: randomUUID(), source, items, counts, arrMissing, createdAt: Date.now() };
      keepPreview(preview);
      return preview;
    }
    const src: ListSource = parseListUrl(url);
    const keys = await getKeys();
    const [fetched, siteTitle] = await Promise.all([fetchListItems(src, keys), fetchListTitle(src, keys)]);
    if (siteTitle) src.label = siteTitle;
    items = fetched.items;
    const types = new Set(items.map((i) => i.mediaType));
    source = { url: src.url, label: src.label, provider: src.provider, providerName: src.providerName, mediaType: types.size === 1 ? [...types][0] : (types.size ? 'mixed' : src.mediaType), resolver: fetched.resolver };
  }
  const { counts, arrMissing } = await annotate(items, await getFilters());
  const preview: Preview = { id: randomUUID(), source, items, counts, arrMissing, createdAt: Date.now() };
  keepPreview(preview);
  return preview;
}

// ─── Add ─────────────────────────────────────────────────────────────

export interface AddResult {
  requested: number;
  added: { key: string; title: string; service: string }[];
  skipped: { key: string; title: string; reason: string; blocked?: boolean }[];
  failed: { key: string; title: string; error: string }[];
  search: boolean;
}

async function exactLookup(item: ListItem): Promise<Record<string, unknown>> {
  const { ids } = item;
  let candidates: Record<string, unknown>[];
  let fields: [string, unknown][];
  if (item.mediaType === 'show') {
    const c = await sonarr();
    if (!c) throw new Error('Sonarr is not set up');
    candidates = await c.lookupSeries(ids.tvdb ? `tvdb:${ids.tvdb}` : `imdb:${ids.imdb ?? ''}`);
    fields = [['tvdbId', ids.tvdb], ['imdbId', ids.imdb]];
  } else {
    const c = await radarr();
    if (!c) throw new Error('Radarr is not set up');
    candidates = await c.lookupMovies(ids.tmdb ? `tmdb:${ids.tmdb}` : `imdb:${ids.imdb ?? ''}`);
    fields = [['tmdbId', ids.tmdb], ['imdbId', ids.imdb]];
  }
  for (const [field, wanted] of fields) {
    if (wanted == null || wanted === '') continue;
    const hit = candidates.find((r) => String(r[field] ?? '') === String(wanted));
    if (hit) return hit;
  }
  throw new Error(`No exact ${item.mediaType === 'show' ? 'Sonarr' : 'Radarr'} match for ${item.title} (${item.year || 'year unknown'})`);
}

async function validateSettings(types: Set<ItemType>, s: AddSettings) {
  // DMM picks quality and location itself (Zurg's settings); no profile/folder to validate.
  if (await selectedDmmService()) return;
  const choices = await arrChoices();
  for (const t of types) {
    const c = t === 'movie' ? choices.movie : choices.show;
    const name = t === 'movie' ? 'Radarr' : 'Sonarr';
    const profile = t === 'movie' ? s.radarrProfileId : s.sonarrProfileId;
    const root = t === 'movie' ? s.radarrRoot : s.sonarrRoot;
    if (!c) throw new ListError(`${name} is not reachable`);
    if (!profile || !root) throw new ListError(`Choose a ${name} quality profile and root folder`);
    if (!c.profiles.some((p) => p.id === profile)) throw new ListError(`Unknown ${name} quality profile`);
    if (!c.roots.some((r) => r.path === root && r.accessible)) throw new ListError(`Unknown or unreachable ${name} root folder`);
  }
}

/** Add the chosen titles. Existing ones are skipped; each title fails on its own, never the batch. */
export async function addItems(items: ListItem[], keys: string[], settingsIn: AddSettings, progress?: (done: number, total: number, phase: string) => void): Promise<AddResult> {
  const settings = cleanSettings(settingsIn);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const selected = [...new Set(keys)].filter((k) => byKey.has(k));
  if (!selected.length) throw new ListError('Select at least one title');
  if (selected.length > MAX_IMPORT_ITEMS) throw new ListError(`Add at most ${MAX_IMPORT_ITEMS} titles at once`);
  const chosen = selected.map((k) => byKey.get(k)!);
  const types = new Set(chosen.map((i) => i.mediaType));
  const dmm = await selectedDmmService();
  await validateSettings(types, settings);
  const filters = await getFilters();

  const libs: Partial<Record<ItemType, Library>> = {};
  for (const t of types) {
    libs[t] = (await loadLibrary(t)) ?? (dmm ? await loadLocalLibrary(t) : { primary: new Set(), imdb: new Set() });
  }

  const result: AddResult = { requested: chosen.length, added: [], skipped: [], failed: [], search: settings.search };
  let done = 0;
  const report = (phase: string) => { done++; try { progress?.(done, chosen.length, phase); } catch { /* never fail the batch */ } };
  const claimed = new Set<string>();

  const one = async (item: ListItem) => {
    const lib = libs[item.mediaType]!;
    const primary = String((item.mediaType === 'show' ? item.ids.tvdb : item.ids.tmdb) ?? '');
    const imdb = String(item.ids.imdb ?? '');
    if ((primary && lib.primary.has(primary)) || (imdb && lib.imdb.has(imdb)) || claimed.has(`${item.mediaType}:${primary}:${imdb}`)) {
      result.skipped.push({ key: item.key, title: item.title, reason: 'already in library' });
      return report(`Skipped ${item.title}`);
    }
    if (item.blocked) {
      result.skipped.push({ key: item.key, title: item.title, reason: item.blockReason ?? 'blocked', blocked: true });
      return report(`Skipped ${item.title}`);
    }
    claimed.add(`${item.mediaType}:${primary}:${imdb}`);
    try {
      if (dmm) {
        // DMM's wanted list is the destination — Zurg does the fetching, so there is no
        // quality profile, root folder or *arr record involved.
        const tmdbId = await tmdbIdFor(item);
        if (!tmdbId) throw new Error('No TMDB id for this title');
        await sendToDmm(dmm.id, item.mediaType === 'movie' ? 'movie' : 'tv', tmdbId);
        if (primary) lib.primary.add(primary);
        if (imdb) lib.imdb.add(imdb);
        result.added.push({ key: item.key, title: item.title, service: 'dmm' });
        return report(`Sent ${item.title} to DMM`);
      }
      const record = structuredClone(await exactLookup(item));
      // Second check on the *arr's own metadata (lists don't always carry language or genres).
      const reason = filterReason({ mediaType: item.mediaType, genres: record.genres, originalLanguage: record.originalLanguage, seriesType: record.seriesType }, filters);
      if (reason) {
        result.skipped.push({ key: item.key, title: item.title, reason: `Filtered: ${reason}`, blocked: true });
        return report(`Filtered ${item.title}`);
      }
      delete record.id;
      Object.assign(record, { monitored: true });
      if (item.mediaType === 'show') {
        Object.assign(record, { qualityProfileId: settings.sonarrProfileId, rootFolderPath: settings.sonarrRoot, seasonFolder: true,
          addOptions: { monitor: 'all', searchForMissingEpisodes: settings.search } });
        await (await sonarr())!.addSeriesRecord(record);
      } else {
        Object.assign(record, { qualityProfileId: settings.radarrProfileId, rootFolderPath: settings.radarrRoot, minimumAvailability: 'released',
          addOptions: { monitor: 'movieOnly', searchForMovie: settings.search } });
        await (await radarr())!.addMovieRecord(record);
      }
      if (primary) lib.primary.add(primary);
      if (imdb) lib.imdb.add(imdb);
      result.added.push({ key: item.key, title: item.title, service: item.mediaType === 'show' ? 'sonarr' : 'radarr' });
      report(`Added ${item.title}`);
    } catch (err) {
      const e = err as { response?: { data?: unknown }; message?: string };
      const detail = Array.isArray(e.response?.data) ? (e.response!.data as { errorMessage?: string }[]).map((d) => d.errorMessage).filter(Boolean).join('; ') : '';
      result.failed.push({ key: item.key, title: item.title, error: (detail || e.message || 'Unknown error').slice(0, 300) });
      report(`Failed ${item.title}`);
    } finally {
      claimed.delete(`${item.mediaType}:${primary}:${imdb}`);
    }
  };

  // Small worker pool: each exact lookup is a slow round trip to the *arr's metadata server.
  const queue = [...chosen];
  await Promise.all(Array.from({ length: WORKERS }, async () => { for (let it = queue.shift(); it; it = queue.shift()) await one(it); }));
  return result;
}

// ─── Background jobs ─────────────────────────────────────────────────

export interface Job {
  id: string;
  kind: 'preview' | 'add' | 'sync' | 'retry';
  label: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt?: string;
  progress?: { done: number; total: number; phase: string };
  result?: unknown;
  error?: string;
}

const jobs = new Map<string, Job>();
// Adds and syncs change the *arrs, so only one runs at a time (as in media-heal).
let writeBusy: string | null = null;

function startJob(kind: Job['kind'], label: string, exclusive: boolean, work: (job: Job) => Promise<unknown>): Job {
  if (exclusive && writeBusy) throw new ListError('Another list import or sync is running. Try again when it finishes.');
  const job: Job = { id: randomUUID(), kind, label, status: 'running', startedAt: new Date().toISOString() };
  if (exclusive) writeBusy = job.id;
  jobs.set(job.id, job);
  // Keep the last 30 jobs.
  if (jobs.size > 30) for (const id of [...jobs.keys()].slice(0, jobs.size - 30)) if (jobs.get(id)?.status !== 'running') jobs.delete(id);
  void (async () => {
    try { job.result = await work(job); job.status = 'done'; }
    catch (err) { job.status = 'failed'; job.error = (err as Error).message; }
    finally { job.finishedAt = new Date().toISOString(); if (writeBusy === job.id) writeBusy = null; }
  })();
  return job;
}

export function getJob(id: string) { return jobs.get(id) ?? null; }
export function listJobs() { return [...jobs.values()].reverse(); }
export function busyJob() { return writeBusy ? jobs.get(writeBusy) ?? null : null; }

const progressInto = (job: Job) => (done: number, total: number, phase: string) => { job.progress = { done, total, phase }; };

export function startPreview(url: string) {
  return startJob('preview', url, false, async (job) => {
    job.progress = { done: 0, total: 0, phase: 'Reading the list' };
    const p = await buildPreview(url);
    return { previewId: p.id };
  });
}

export function startAdd(previewId: string, keys: string[], settings: AddSettings, subscribe: boolean, name?: string) {
  const p = getPreview(previewId);
  if (!p) throw new ListError('This preview has expired; preview the list again');
  return startJob('add', p.source.label, true, async (job) => {
    // Subscribing with nothing to add right now just starts watching the list.
    const result: AddResult & { blocked?: number } = keys.length || !subscribe
      ? await addItems(p.items, keys, settings, progressInto(job))
      : await validateSettings(new Set(p.items.map((i) => i.mediaType)), cleanSettings(settings)).then(() => ({ requested: 0, added: [], skipped: [], failed: [], search: !!settings.search }));
    result.blocked = p.counts.blocked;
    if (subscribe) await saveSubscription(p, settings, result, name);
    logEvent('info', 'Lists', `Added ${result.added.length} of ${result.requested} from ${p.source.label}`);
    notifyListAdded(name?.trim() || p.source.label, result.added.map((a) => a.title));
    return result;
  });
}

// ─── Subscriptions ───────────────────────────────────────────────────

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

async function saveSubscription(p: Pick<Preview, 'source' | 'items'>, settings: AddSettings, result: AddResult & { blocked?: number }, name?: string) {
  const existing = await prisma.listSubscription.findUnique({ where: { url: p.source.url } });
  const seenBefore = new Set(parseJson<string[]>(existing?.seenKeys, []));
  const fresh = p.items.map((i) => i.key);
  const newKeys = seenBefore.size ? fresh.filter((k) => !seenBefore.has(k)) : [];
  const titleOf = new Map(p.items.map((i) => [i.key, i.title]));
  const now = new Date().toISOString();
  const history = [...parseJson<unknown[]>(existing?.history, []), ...result.added.slice(0, 50).map((a) => ({ key: a.key, title: a.title, service: a.service, at: now }))].slice(-HISTORY_MAX);
  // Titles the Radarr/Sonarr record filtered out: remembered for a week so scheduled syncs don't
  // look them up again every time (media-heal's blocked_keys).
  const remembered = { ...knownBlocked(existing?.lastResult) };
  for (const sk of result.skipped) if (sk.blocked && sk.reason.startsWith('Filtered')) remembered[sk.key] = { reason: sk.reason, at: now };
  const data = {
    name: name ?? existing?.name ?? p.source.label,
    provider: p.source.provider,
    mediaType: p.source.mediaType,
    settings: JSON.stringify(cleanSettings(settings)),
    seenKeys: JSON.stringify([...new Set(fresh)].sort()),
    lastNew: JSON.stringify(newKeys.slice(0, 50).map((k) => ({ key: k, title: titleOf.get(k) ?? k }))),
    history: JSON.stringify(history),
    lastResult: JSON.stringify({
      added: result.added.length, skipped: result.skipped.length, failed: result.failed.length, blocked: result.blocked ?? 0,
      failures: result.failed.slice(0, 25),
      blockedKeys: remembered,
    }),
    lastError: result.failed.length ? `${result.failed.length} title(s) failed` : null,
    lastCheckedAt: new Date(),
  };
  await prisma.listSubscription.upsert({ where: { url: p.source.url }, update: data, create: { url: p.source.url, enabled: true, ...data } });
}

const REMEMBER_BLOCKED_MS = 7 * 24 * 3600_000;
function knownBlocked(lastResult: string | null | undefined): Record<string, { reason: string; at: string }> {
  const all = parseJson<{ blockedKeys?: Record<string, { reason: string; at: string }> }>(lastResult, {}).blockedKeys ?? {};
  const cutoff = Date.now() - REMEMBER_BLOCKED_MS;
  return Object.fromEntries(Object.entries(all).filter(([, v]) => new Date(v.at).getTime() > cutoff));
}

/** One subscription: re-read the list, add whatever is missing and not blocked. `fresh` (Sync now)
 *  re-checks titles a recent sync already filtered out. */
async function syncOne(url: string, progress?: (d: number, t: number, phase: string) => void, fresh = false) {
  const sub = await prisma.listSubscription.findUnique({ where: { url } });
  if (!sub) throw new ListError('List subscription not found');
  const settings = cleanSettings(parseJson<AddSettings>(sub.settings, { search: false }));
  try {
    const p = await buildPreview(url);
    const seen = new Set(parseJson<string[]>(sub.seenKeys, []));
    if (!fresh) {
      const known = knownBlocked(sub.lastResult);
      for (const i of p.items) if (!i.existing && !i.blocked && known[i.key]) { i.blocked = true; i.blockReason = known[i.key].reason; p.counts.missing--; p.counts.blocked++; }
    }
    const missing = p.items.filter((i) => !i.existing && !i.blocked && !(settings.onlyNew && seen.size && seen.has(i.key))).map((i) => i.key);
    const result: AddResult & { blocked?: number } = missing.length
      ? await addItems(p.items, missing, settings, progress)
      : { requested: 0, added: [], skipped: [], failed: [], search: settings.search };
    result.blocked = p.counts.blocked;
    await saveSubscription(p, settings, result);
    notifyListAdded(sub.name ?? p.source.label, result.added.map((a) => a.title));
    if (result.added.length) logEvent('info', 'Lists', `${sub.name ?? url}: added ${result.added.length} (${result.added.slice(0, 5).map((a) => a.title).join(', ')}${result.added.length > 5 ? ', ...' : ''})`);
    return result;
  } catch (err) {
    // `updateMany`: the subscription may have been deleted while this sync was running.
    await prisma.listSubscription.updateMany({ where: { url }, data: { lastError: (err as Error).message.slice(0, 500), lastCheckedAt: new Date() } });
    logEvent('warn', 'Lists', `${sub.name ?? url}: sync failed: ${(err as Error).message}`);
    throw err;
  }
}

export function startSyncNow(url: string) {
  return startJob('sync', url, true, async (job) => syncOne(url, progressInto(job), true));
}

/** Re-try only the titles that failed last time. */
export function startRetry(url: string) {
  return startJob('retry', url, true, async (job) => {
    const sub = await prisma.listSubscription.findUnique({ where: { url } });
    if (!sub) throw new ListError('List subscription not found');
    const failed = parseJson<{ failures?: { key: string }[] }>(sub.lastResult, {}).failures?.map((f) => f.key) ?? [];
    if (!failed.length) throw new ListError('Nothing failed last time');
    const p = await buildPreview(url);
    const keys = failed.filter((k) => p.items.some((i) => i.key === k && !i.existing && !i.blocked));
    if (!keys.length) throw new ListError('Every failed title is now in the library or blocked');
    const result: AddResult & { blocked?: number } = await addItems(p.items, keys, parseJson<AddSettings>(sub.settings, { search: false }), progressInto(job));
    result.blocked = p.counts.blocked;
    await saveSubscription(p, parseJson<AddSettings>(sub.settings, { search: false }), result);
    notifyListAdded(sub.name ?? p.source.label, result.added.map((a) => a.title));
    return result;
  });
}

/** Scheduler entry: sync every enabled subscription whose interval has passed. */
export async function runDueSubscriptions() {
  if (writeBusy) return { skipped: 'busy' };
  const hours = await syncIntervalHours();
  const cutoff = Date.now() - hours * 3600_000;
  const due = (await prisma.listSubscription.findMany({ where: { enabled: true }, orderBy: { id: 'asc' } }))
    .filter((s) => !s.lastCheckedAt || s.lastCheckedAt.getTime() <= cutoff);
  if (!due.length) return { due: 0 };
  const job = startJob('sync', due.length === 1 ? due[0].url : `${due.length} subscribed lists`, true, async (j) => {
    const out: Record<string, unknown> = {};
    for (const s of due) {
      j.progress = { done: 0, total: 0, phase: `Syncing ${s.name ?? s.url}` };
      try { const r = await syncOne(s.url, progressInto(j)); out[s.url] = { added: r.added.length, failed: r.failed.length }; }
      catch (err) { out[s.url] = { error: (err as Error).message }; }
    }
    return out;
  });
  return { due: due.length, jobId: job.id };
}

export async function listSubscriptions() {
  const hours = await syncIntervalHours();
  const rows = await prisma.listSubscription.findMany({ orderBy: { createdAt: 'asc' } });
  return {
    intervalHours: hours,
    busy: busyJob(),
    subscriptions: rows.map((r) => ({
      id: r.id, url: r.url, name: r.name, provider: r.provider, mediaType: r.mediaType, enabled: r.enabled,
      settings: parseJson<AddSettings>(r.settings, { search: false }),
      seenCount: parseJson<string[]>(r.seenKeys, []).length,
      lastNew: parseJson<unknown[]>(r.lastNew, []),
      history: parseJson<unknown[]>(r.history, []).slice(-20).reverse(),
      lastResult: parseJson<unknown>(r.lastResult, null),
      lastError: r.lastError,
      lastCheckedAt: r.lastCheckedAt,
      nextSyncAt: r.enabled ? new Date((r.lastCheckedAt?.getTime() ?? 0) + hours * 3600_000) : null,
    })),
  };
}

export async function updateSubscription(id: number, patch: { enabled?: boolean; name?: string; settings?: Partial<AddSettings> }) {
  const sub = await prisma.listSubscription.findUnique({ where: { id } });
  if (!sub) throw new ListError('List subscription not found');
  const data: { enabled?: boolean; name?: string; settings?: string } = {};
  if (patch.enabled !== undefined) data.enabled = !!patch.enabled;
  if (patch.name !== undefined) data.name = patch.name.trim().slice(0, 120) || null as unknown as string;
  if (patch.settings) data.settings = JSON.stringify(cleanSettings({ ...parseJson<AddSettings>(sub.settings, { search: false }), ...patch.settings }));
  await prisma.listSubscription.update({ where: { id }, data });
}

export async function deleteSubscription(id: number) {
  // Deleting a subscription never conflicts with a running sync: the job reads its own snapshot
  // and writes results with `updateMany`, so a row that disappears mid-run is simply skipped.
  // Blocking this while any list job ran left paused lists impossible to remove for minutes at a
  // time, which is exactly when someone wants to clear them out.
  await prisma.listSubscription.delete({ where: { id } });
}

/**
 * Bring media-heal's subscriptions across (its dmm-list-subscriptions.json), keeping each list's
 * settings, seen titles and history so nothing is re-added or forgotten. Existing rows are left
 * alone unless `overwrite` is set. `paused` brings them in switched off (for a side-by-side check
 * before media-heal stops syncing).
 */
export async function importMediaHealSubscriptions(payload: unknown, overwrite = false, paused = false) {
  const rows = (payload as { subscriptions?: Record<string, any> })?.subscriptions ?? payload;
  if (!rows || typeof rows !== 'object') throw new ListError('Not a media-heal subscriptions file');
  const out = { imported: 0, skipped: 0 };
  for (const [key, s] of Object.entries(rows as Record<string, any>)) {
    if (!s || typeof s !== 'object') continue;
    const url = String(s.url ?? key).replace(/\/+$/, '');
    let provider = '';
    let name: string | null = null;
    const enabled = s.subscribe !== false && !paused;
    const lastError: string | null = s.last_error || null;
    if (url === WWE_URL) { provider = 'wwe'; name = WWE_LABEL; }
    else if (url.startsWith('custom:')) { out.skipped++; continue; }
    else { try { const src = parseListUrl(url); provider = src.provider; name = src.label; } catch { out.skipped++; continue; } }
    const st = s.settings ?? {};
    const settings = cleanSettings({
      search: !!st.search, onlyNew: false,
      radarrProfileId: st.radarr_quality_profile_id, radarrRoot: st.radarr_root_folder,
      sonarrProfileId: st.sonarr_quality_profile_id, sonarrRoot: st.sonarr_root_folder,
    });
    const lr = s.last_result ?? null;
    const data = {
      name, provider, mediaType: provider === 'wwe' ? 'movie' : String(s.media_type ?? 'mixed'), enabled,
      settings: JSON.stringify(settings),
      seenKeys: JSON.stringify(Array.isArray(s.seen_keys) ? s.seen_keys : []),
      lastNew: JSON.stringify(Array.isArray(s.last_new) ? s.last_new : []),
      history: JSON.stringify(Array.isArray(s.history) ? s.history.slice(-HISTORY_MAX) : []),
      lastResult: lr ? JSON.stringify(lr) : null,
      lastError,
      lastCheckedAt: s.last_checked ? new Date(s.last_checked) : null,
    };
    const exists = await prisma.listSubscription.findUnique({ where: { url } });
    if (exists && !overwrite) { out.skipped++; continue; }
    await prisma.listSubscription.upsert({ where: { url }, update: data, create: { url, ...data } });
    out.imported++;
  }
  return out;
}

// ─── Lists defined inside Radarr / Sonarr ─────────────────────────────

type ArrApp = 'radarr' | 'sonarr';
const field = (row: Record<string, any>, name: string) => (row.fields as { name: string; value: unknown }[] | undefined)?.find((f) => f.name === name)?.value;
const nativeAuto = (app: ArrApp, row: Record<string, any>) => (app === 'sonarr' ? !!row.enableAutomaticAdd : !!(row.enabled && row.enableAuto));

/** The LeMedia link for a list the *arr defines, when LeMedia can read the same source. */
function linkFor(app: ArrApp, row: Record<string, any>): string | null {
  try {
    if (row.implementation === 'IMDbListImport') {
      const id = String(field(row, 'listId') ?? '').trim().toLowerCase();
      if (id === 'top250') return 'https://www.imdb.com/chart/top';
      if (id === 'popular') return 'https://www.imdb.com/chart/moviemeter';
      if (/^ls\d+$/.test(id)) return `https://www.imdb.com/list/${id}`;
      if (/^ur\d+$/.test(id)) return `https://www.imdb.com/user/${id}/watchlist`;
      return null;
    }
    const raw = String(field(row, app === 'sonarr' ? 'baseUrl' : 'url') ?? field(row, 'listUrl') ?? '').trim().replace(/\/(json)?\/?$/, '');
    if (!raw) return null;
    return parseListUrl(raw).url;
  } catch { return null; }
}

/** Every import list Radarr and Sonarr have, and whether LeMedia can (or already does) run it. */
export async function arrImportLists() {
  const subs = new Set((await prisma.listSubscription.findMany({ select: { url: true } })).map((s) => s.url));
  const out: { app: ArrApp; id: number; name: string; implementation: string; autoAdd: boolean; enabled: boolean; link: string | null; inLeMedia: boolean }[] = [];
  for (const app of ['radarr', 'sonarr'] as const) {
    const c = app === 'radarr' ? await radarr() : await sonarr();
    if (!c) continue;
    const rows = await c.getImportLists().catch(() => []);
    for (const row of rows as Record<string, any>[]) {
      const link = linkFor(app, row);
      out.push({ app, id: Number(row.id), name: String(row.name ?? 'Unnamed list'), implementation: String(row.implementationName ?? row.implementation ?? ''),
        autoAdd: nativeAuto(app, row), enabled: !!row.enabled, link, inLeMedia: !!link && subs.has(link) });
    }
  }
  return out;
}

/** Run a Radarr/Sonarr list through LeMedia instead (with the filters), and switch off the *arr's
 *  own auto-add for it so titles aren't added unfiltered. The list stays in the *arr, editable. */
export async function adoptArrList(app: ArrApp, id: number, enabled: boolean) {
  const c = app === 'radarr' ? await radarr() : await sonarr();
  if (!c) throw new ListError(`${app === 'radarr' ? 'Radarr' : 'Sonarr'} is not set up`);
  const row = await c.getImportList(id) as Record<string, any>;
  const link = linkFor(app, row);
  if (!link) throw new ListError('LeMedia can\'t read this kind of list yet');
  const settings = cleanSettings(app === 'radarr'
    ? { search: !!row.searchOnAdd, radarrProfileId: row.qualityProfileId, radarrRoot: row.rootFolderPath }
    : { search: !!row.searchForMissingEpisodes, sonarrProfileId: row.qualityProfileId, sonarrRoot: row.rootFolderPath });
  const src = parseListUrl(link);
  const existing = await prisma.listSubscription.findUnique({ where: { url: src.url } });
  if (!existing) {
    // The *arr decides the type: a Sonarr list only ever feeds Sonarr.
    await prisma.listSubscription.create({ data: { url: src.url, name: String(row.name ?? src.label), provider: src.provider, mediaType: app === 'radarr' ? 'movie' : 'show',
      enabled, settings: JSON.stringify(settings) } });
  }
  if (nativeAuto(app, row)) {
    await c.updateImportList(id, { ...row, ...(app === 'sonarr' ? { enableAutomaticAdd: false } : { enableAuto: false }) });
    if (nativeAuto(app, await c.getImportList(id) as Record<string, any>)) throw new ListError(`${app === 'radarr' ? 'Radarr' : 'Sonarr'} didn't switch off its own auto-add`);
  }
  logEvent('info', 'Lists', `Took over ${app} list "${row.name}" (${src.url})`);
  return { url: src.url, created: !existing };
}

// ─── Handmade lists ──────────────────────────────────────────────────

export async function listCustomLists() {
  const rows = await prisma.customList.findMany({ orderBy: { createdAt: 'asc' } });
  return rows.map((r) => ({ id: r.id, name: r.name, items: parseJson<ListItem[]>(r.items, []), updatedAt: r.updatedAt }));
}

export async function createCustomList(name: string) {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new ListError('Give the list a name');
  return prisma.customList.create({ data: { id: randomUUID().slice(0, 12), name: clean } });
}

export async function renameCustomList(id: string, name: string) {
  const clean = name.trim().slice(0, 120);
  if (!clean) throw new ListError('Give the list a name');
  await prisma.customList.update({ where: { id }, data: { name: clean } });
}

export async function deleteCustomList(id: string) {
  await prisma.customList.delete({ where: { id } });
  await prisma.listSubscription.deleteMany({ where: { url: `custom:${id}` } });
}

/** Add a TMDB title to a handmade list. Shows are resolved to their TVDB id (what Sonarr needs). */
export async function addToCustomList(id: string, tmdbId: number, type: 'movie' | 'tv') {
  const list = await prisma.customList.findUnique({ where: { id } });
  if (!list) throw new ListError('Handmade list not found');
  const items = parseJson<ListItem[]>(list.items, []);
  if (items.length >= MAX_IMPORT_ITEMS) throw new ListError(`A handmade list holds at most ${MAX_IMPORT_ITEMS} titles`);
  const api = getTmdbApi('en');
  let item: ListItem;
  if (type === 'movie') {
    const { data } = await api.get(`/movie/${tmdbId}`);
    item = {
      key: `movie:tmdb:${data.id}`, mediaType: 'movie', title: data.title, year: Number(String(data.release_date ?? '').slice(0, 4)) || 0,
      ids: { tmdb: data.id, ...(data.imdb_id ? { imdb: data.imdb_id } : {}) }, overview: String(data.overview ?? '').slice(0, 320),
      genres: (data.genres ?? []).map((g: { name: string }) => g.name), originalLanguage: data.original_language ?? '', feeds: [], appearances: 1, rank: items.length,
    };
  } else {
    const { data } = await api.get(`/tv/${tmdbId}`, { params: { append_to_response: 'external_ids' } });
    const tvdb = data.external_ids?.tvdb_id;
    const imdb = data.external_ids?.imdb_id;
    if (!tvdb && !imdb) throw new ListError(`${data.name} has no TVDB or IMDb id yet, so Sonarr can't add it`);
    const ns = tvdb ? `tvdb:${tvdb}` : `imdb:${imdb}`;
    item = {
      key: `show:${ns}`, mediaType: 'show', title: data.name, year: Number(String(data.first_air_date ?? '').slice(0, 4)) || 0,
      ids: { tmdb: data.id, ...(tvdb ? { tvdb } : {}), ...(imdb ? { imdb } : {}) }, overview: String(data.overview ?? '').slice(0, 320),
      genres: (data.genres ?? []).map((g: { name: string }) => g.name), originalLanguage: data.original_language ?? '', feeds: [], appearances: 1, rank: items.length,
    };
  }
  if (items.some((i) => i.key === item.key)) throw new ListError(`${item.title} is already on this list`);
  items.push(item);
  await prisma.customList.update({ where: { id }, data: { items: JSON.stringify(items) } });
  return item;
}

export async function removeFromCustomList(id: string, key: string) {
  const list = await prisma.customList.findUnique({ where: { id } });
  if (!list) throw new ListError('Handmade list not found');
  const items = parseJson<ListItem[]>(list.items, []).filter((i) => i.key !== key);
  await prisma.customList.update({ where: { id }, data: { items: JSON.stringify(items) } });
}

export { ListError };

// ─── Names ───────────────────────────────────────────────────────────

// Labels LeMedia used to generate (and the two lists moved over from Radarr/Sonarr). Anything
// else is a name someone chose, and is left alone.
const OLD_AUTO_NAME = [/^MDBList \S+\/\S+$/, /^Trakt list \S+\/\S+$/, /^Trakt watchlist \S+$/, /^TMDB list \d+$/,
  /^Trakt (trending|popular|anticipated|boxoffice) (movies|shows)$/, /^DMM (shows|movies)$/, /^DMM browse \(MDBList top lists\)$/,
  /^DMM genre \S+$/, /^DMM browse ".*"$/, /^IMDB top250$/i, /\(MDBList snoak\)$/];

/** Once at start: give auto-named subscriptions the list's real title (or a readable label). */
export async function tidySubscriptionNames() {
  const keys = await getKeys();
  for (const sub of await prisma.listSubscription.findMany()) {
    if (sub.name && !OLD_AUTO_NAME.some((re) => re.test(sub.name!))) continue;
    if (!/^https:\/\//.test(sub.url)) continue;
    try {
      const src = parseListUrl(sub.url);
      const name = (await fetchListTitle(src, keys)) ?? src.label;
      if (name && name !== sub.name) {
        await prisma.listSubscription.update({ where: { id: sub.id }, data: { name } });
        logEvent('info', 'Lists', `Renamed "${sub.name ?? sub.url}" to "${name}"`);
      }
    } catch { /* leave it */ }
  }
}
