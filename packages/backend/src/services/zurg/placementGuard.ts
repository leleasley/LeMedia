/**
 * Placement-import guard: import releases Zurg placed but Radarr/Sonarr never registered.
 * Ported from media-heal's placement_import.py.
 *
 * Zurg places a release under `__magic__` and asks rclone to forget the cached listing so the
 * *arr's rescan sees it. That invalidation is batched and can time out; then the *arr's scan
 * reads an empty folder, imports nothing, and nothing retries. There's no queue row either
 * (placement is server-side), so nothing else notices.
 *
 * A placement is a candidate only when the Zurg job is done with a `placed` path, the file is
 * really there, the *arr has no file for it (all named episodes, for shows) and nothing for it is
 * queued. The fix is a bounded RescanMovie / RescanSeries: no deletes, no blocklists. Each item
 * gets 3 tries, 30 minutes apart, at most 25 per run.
 */
import axios from 'axios';
import { prisma } from '../../utils/prisma.js';
import { getServiceConfig } from '../../utils/services.js';
import { logEvent } from '../../utils/logEvent.js';
import { getZurgConn, getZurgStatus, type ZurgConn, type ZurgJob } from './client.js';

const STATE_ID = 'placement-import';
const MAX_ATTEMPTS = 3;
const COOLDOWN_MS = 30 * 60_000;
const MAX_PER_RUN = 25;

interface Candidate { key: string; source: string; title: string; placed: string; movieId?: number; seriesId?: number; season?: number; episodes?: number[] }
interface Entry { firstSeen: string; attempts: number; lastAttempt?: number; lastResult?: string; title?: string; placed?: string; source?: string }

const SONARR_ID = /^(\d+):s(\d+):e([\d,-]+)$/;
function parseSonarr(id: string) {
  const m = SONARR_ID.exec(id.trim());
  if (!m) return null;
  const eps = new Set<number>();
  for (const part of m[3].split(',').map((p) => p.trim()).filter(Boolean)) {
    if (part.includes('-')) { const [a, b] = part.split('-').map(Number); for (let n = Math.min(a, b); n <= Math.max(a, b); n++) eps.add(n); }
    else eps.add(Number(part));
  }
  return eps.size ? { seriesId: Number(m[1]), season: Number(m[2]), episodes: [...eps].sort((x, y) => x - y) } : null;
}

function donePlacements(jobs: ZurgJob[]): Candidate[] {
  const out: Candidate[] = [];
  for (const j of jobs) {
    if (j.state !== 'done' || !j.placed?.trim()) continue;
    const base = { key: `${j.source}:${j.id}`, source: j.source, title: j.title ?? j.item, placed: j.placed.trim() };
    if (j.source === 'radarr:movies') { const id = Number.parseInt(j.id, 10); if (id) out.push({ ...base, movieId: id }); }
    else if (j.source === 'sonarr:shows') { const p = parseSonarr(j.id); if (p) out.push({ ...base, ...p }); }
  }
  return out;
}

/** A file, or a folder with at least one file in it (an empty folder proves nothing arrived). */
async function placedHasFile(conn: ZurgConn, placed: string): Promise<boolean> {
  const path = placed.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  try {
    const res = await axios.request({ method: 'PROPFIND', url: `${conn.base}/dav/__magic__/${path}`, headers: { Depth: '1' }, timeout: 15_000,
      auth: conn.auth, validateStatus: () => true, responseType: 'text', maxContentLength: 2 * 1024 * 1024 });
    if (res.status !== 207 && res.status !== 200) return false;
    const responses = String(res.data).split(/<(?:[a-z]+:)?response[\s>]/i).slice(1);
    return responses.some((r) => !/<(?:[a-z]+:)?collection\s*\/?>/i.test(r));
  } catch { return false; }
}

interface Arr { base: string; key: string }
async function arr(type: 'radarr' | 'sonarr'): Promise<Arr | null> {
  const c = await getServiceConfig(type).catch(() => null);
  return c?.url && c.apiKey ? { base: `${c.url.replace(/\/+$/, '')}/api/v3`, key: c.apiKey } : null;
}
async function get<T>(a: Arr, path: string, timeout = 60_000): Promise<T> {
  const { data } = await axios.get<T>(`${a.base}${path}`, { headers: { 'X-Api-Key': a.key }, timeout });
  return data;
}
async function command(a: Arr, body: Record<string, unknown>) {
  const { data } = await axios.post<{ id: number }>(`${a.base}/command`, body, { headers: { 'X-Api-Key': a.key }, timeout: 20_000 });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await get<{ status: string }>(a, `/command/${data.id}`, 10_000).catch(() => null);
    if (st && ['completed', 'failed', 'aborted'].includes(st.status)) return st.status;
  }
  return 'timeout';
}

async function readState(): Promise<Record<string, Entry>> {
  const row = await prisma.integration.findUnique({ where: { id: STATE_ID } });
  try { return row ? JSON.parse(row.config) : {}; } catch { return {}; }
}
async function writeState(s: Record<string, Entry>) {
  const config = JSON.stringify(s);
  await prisma.integration.upsert({ where: { id: STATE_ID }, update: { config }, create: { id: STATE_ID, config } });
}

const queuedIds = async (a: Arr, field: 'movieId' | 'seriesId') => new Set(
  ((await get<{ records: Record<string, number>[] }>(a, '/queue?page=1&pageSize=1000').catch(() => ({ records: [] }))).records ?? []).map((r) => r[field]).filter(Boolean),
);

export async function runPlacementGuard(apply = true) {
  const conn = await getZurgConn();
  if (!conn) return { skipped: 'zurg not configured' };
  const jobs = (await getZurgStatus(conn)).jobs ?? [];
  const all = donePlacements(jobs);
  const [radarr, sonarr] = await Promise.all([arr('radarr'), arr('sonarr')]);
  const skipped = { hasFile: 0, queued: 0, absent: 0, notInArr: 0 };
  const found: Candidate[] = [];

  if (radarr) {
    const movies = await get<{ id: number; hasFile: boolean }[]>(radarr, '/movie', 120_000);
    const byId = new Map(movies.map((m) => [m.id, m]));
    const queued = await queuedIds(radarr, 'movieId');
    for (const c of all.filter((x) => x.movieId)) {
      if (queued.has(c.movieId!)) { skipped.queued++; continue; }
      const m = byId.get(c.movieId!);
      if (!m) { skipped.notInArr++; continue; }
      if (m.hasFile) { skipped.hasFile++; continue; }
      if (!(await placedHasFile(conn, c.placed))) { skipped.absent++; continue; }
      found.push(c);
    }
  }
  if (sonarr) {
    const known = new Set((await get<{ id: number }[]>(sonarr, '/series', 120_000)).map((s) => s.id));
    const queued = await queuedIds(sonarr, 'seriesId');
    const live = all.filter((x) => x.seriesId).filter((c) => {
      if (queued.has(c.seriesId!)) { skipped.queued++; return false; }
      // The series may have been removed since Zurg finished the job.
      if (!known.has(c.seriesId!)) { skipped.notInArr++; return false; }
      return true;
    });
    const episodes = new Map<number, { seasonNumber: number; episodeNumber: number; hasFile: boolean }[]>();
    const ids = [...new Set(live.map((c) => c.seriesId!))];
    for (let i = 0; i < ids.length; i += 4) {
      await Promise.all(ids.slice(i, i + 4).map(async (id) => { episodes.set(id, await get<{ seasonNumber: number; episodeNumber: number; hasFile: boolean }[]>(sonarr, `/episode?seriesId=${id}`).catch(() => [])); }));
    }
    for (const c of live) {
      const present = new Set((episodes.get(c.seriesId!) ?? []).filter((e) => e.seasonNumber === c.season && e.hasFile).map((e) => e.episodeNumber));
      // Only a placement that registered nothing at all is unambiguous.
      if (c.episodes!.some((n) => present.has(n))) { skipped.hasFile++; continue; }
      if (!(await placedHasFile(conn, c.placed))) { skipped.absent++; continue; }
      found.push(c);
    }
  }

  const state = await readState();
  const seen = new Map(found.map((c) => [c.key, c]));
  for (const k of Object.keys(state)) if (!seen.has(k)) delete state[k];
  for (const c of found) state[c.key] = { ...(state[c.key] ?? { firstSeen: new Date().toISOString(), attempts: 0 }), title: c.title, placed: c.placed, source: c.source };
  await writeState(state);

  const result = { candidates: found.length, skipped, rescanned: { movies: 0, series: 0 }, corrected: 0, parked: 0, errors: [] as string[] };
  if (apply && found.length) {
    const now = Date.now();
    const todo = found.filter((c) => (state[c.key].attempts ?? 0) < MAX_ATTEMPTS && now - (state[c.key].lastAttempt ?? 0) >= COOLDOWN_MS).slice(0, MAX_PER_RUN);
    const movieIds = [...new Set(todo.filter((c) => c.movieId).map((c) => c.movieId!))];
    const seriesIds = [...new Set(todo.filter((c) => c.seriesId).map((c) => c.seriesId!))];
    for (const id of movieIds) { try { await command(radarr!, { name: 'RescanMovie', movieId: id }); } catch (err) { result.errors.push(`radarr rescan ${id}: ${(err as Error).message}`); } }
    for (const id of seriesIds) { try { await command(sonarr!, { name: 'RescanSeries', seriesId: id }); } catch (err) { result.errors.push(`sonarr rescan ${id}: ${(err as Error).message}`); } }
    result.rescanned = { movies: movieIds.length, series: seriesIds.length };
    for (const c of todo) {
      const e = state[c.key];
      e.attempts = (e.attempts ?? 0) + 1;
      e.lastAttempt = Date.now();
      let ok = false;
      try {
        if (c.movieId) ok = (await get<{ hasFile: boolean }>(radarr!, `/movie/${c.movieId}`)).hasFile;
        else {
          const rows = await get<{ seasonNumber: number; episodeNumber: number; hasFile: boolean }[]>(sonarr!, `/episode?seriesId=${c.seriesId}`);
          const present = new Set(rows.filter((r) => r.seasonNumber === c.season && r.hasFile).map((r) => r.episodeNumber));
          ok = c.episodes!.every((n) => present.has(n));
        }
      } catch { ok = false; }
      if (ok) { delete state[c.key]; result.corrected++; } else e.lastResult = 'rescan did not register the file';
    }
    await writeState(state);
    if (result.corrected || result.errors.length) {
      logEvent(result.errors.length ? 'warn' : 'info', 'Zurg', `Placement import guard: ${result.corrected} release(s) placed by Zurg but never imported were rescanned in (${movieIds.length} movie, ${seriesIds.length} series)${result.errors.length ? `, ${result.errors.length} error(s)` : ''}`);
    }
  }
  result.parked = Object.values(state).filter((e) => (e.attempts ?? 0) >= MAX_ATTEMPTS).length;
  return result;
}
