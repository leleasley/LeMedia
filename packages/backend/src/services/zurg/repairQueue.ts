import axios from 'axios';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logEvent } from '../../utils/logEvent.js';
import { getZurgConn, zurgGet, zurgPost, type ZurgConn } from './client.js';
import { markGone } from './reportOverrides.js';

/**
 * Broken releases (TorBox no longer serves their files) and an operator-driven repair queue.
 * Zurg's own unattended repair is off on this stack (`enable_repair: false`), so nothing here
 * sweeps by itself: repairs only run when an admin queues them, one at a time with a pause in
 * between for TorBox. A repair asks zurg to re-add the release; when TorBox still has it cached
 * it comes back (and re-appears where it was placed) within seconds. When it can't be restored,
 * an unused copy can go to zurg's 30-day trash; a copy Radarr/Sonarr uses is left alone.
 */

export type BrokenState = 'broken' | 'under_repair' | 'cannot_repair';
export interface BrokenRelease { hash: string; name: string; sizeBytes: number; brokenFiles: number; totalFiles: number; state: BrokenState }

const STATE_PAGES: Record<BrokenState, string> = {
  broken: 'status_broken',
  under_repair: 'status_under_repair',
  cannot_repair: 'status_cannot_repair',
};

const unescape = (x: string) => x
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Zurg's manage list is HTML only; each row carries its data in attributes. */
export async function listBroken(conn: ZurgConn): Promise<BrokenRelease[]> {
  const out: BrokenRelease[] = [];
  const seen = new Set<string>();
  for (const state of ['under_repair', 'cannot_repair', 'broken'] as BrokenState[]) {
    const html = await zurgGet<string>(conn, `/manage/?state=${STATE_PAGES[state]}`, 30_000);
    for (const m of String(html).matchAll(/<tr class="torrent-row"([^>]*)>/g)) {
      const attr = (n: string) => new RegExp(`data-${n}="([^"]*)"`).exec(m[1])?.[1] ?? '';
      const hash = attr('hash');
      if (!/^[0-9a-f]{8,64}$/i.test(hash) || seen.has(hash)) continue;
      seen.add(hash);
      out.push({ hash, name: unescape(attr('name')), sizeBytes: Number(attr('size')) || 0, brokenFiles: Number(attr('broken')) || 0, totalFiles: Number(attr('total')) || 0, state });
    }
  }
  return out;
}

export type OnFail = 'trash' | 'keep';
export type RepairJobState = 'queued' | 'running' | 'fixed' | 'removed' | 'failed';

export interface RepairJob {
  id: string;
  hash: string;
  name: string;
  sizeBytes: number;
  onFail: OnFail;
  by: string;
  state: RepairJobState;
  step: string | null;
  message: string | null;
  queuedAt: string;
  finishedAt: string | null;
}

const FILE = join(process.env.INSTALL_FILE_PATH ? dirname(process.env.INSTALL_FILE_PATH) : './data', 'zurg-repairs.json');
const KEEP_FINISHED = 200;
const POLL_MS = 6_000;
const ATTEMPT_MS = 90_000;      // how long one repair attempt is watched
const ATTEMPTS = 3;             // zurg's first "unrepairable" is often wrong, a later repair works
const RETRY_GAP_MS = 2 * 60_000;
const PAUSE_BETWEEN_MS = 60_000;
// Every repair is a TorBox "add". A burst of them (≈30/h) left TorBox timing out adds — which
// also stalls new downloads — so requests are budgeted and only sent when zurg is idle.
const HOURLY_BUDGET = 20;
const ZURG_BUSY_LIMIT_MS = 15 * 60_000;
const CONTROL_FILE = FILE.replace(/\.json$/, '-control.json');

interface QueueControl { paused: boolean; reason: string | null; requests: number[] }

let jobs: RepairJob[] = load();
let control: QueueControl = loadControl();
let running = false;

class QueuePaused extends Error {}

function loadControl(): QueueControl {
  try { return { paused: false, reason: null, requests: [], ...JSON.parse(readFileSync(CONTROL_FILE, 'utf8')) as Partial<QueueControl> }; }
  catch { return { paused: false, reason: null, requests: [] }; }
}

function saveControl() {
  try { writeFileSync(CONTROL_FILE, JSON.stringify(control)); } catch { /* best effort */ }
}

export function repairControl() {
  const hourAgo = Date.now() - 3_600_000;
  const recent = control.requests.filter((t) => t > hourAgo);
  return { paused: control.paused, reason: control.reason, usedThisHour: recent.length, hourlyBudget: HOURLY_BUDGET };
}

export function pauseRepairs(reason: string | null = null) {
  control.paused = true;
  control.reason = reason;
  saveControl();
}

export function resumeRepairs() {
  control.paused = false;
  control.reason = null;
  saveControl();
  void pump();
}

function load(): RepairJob[] {
  try {
    return (JSON.parse(readFileSync(FILE, 'utf8')) as RepairJob[]).map((j) => (j.state === 'running'
      ? { ...j, state: 'queued' as const, step: null } // a repair is safe to ask for again
      : j));
  } catch {
    return [];
  }
}

function save() {
  const finished = jobs.filter((j) => j.state !== 'queued' && j.state !== 'running');
  if (finished.length > KEEP_FINISHED) {
    const drop = new Set(finished.slice(0, finished.length - KEEP_FINISHED).map((j) => j.id));
    jobs = jobs.filter((j) => !drop.has(j.id));
  }
  try {
    writeFileSync(`${FILE}.tmp`, JSON.stringify(jobs));
    renameSync(`${FILE}.tmp`, FILE);
  } catch (err) {
    logEvent('warn', 'Zurg', `Could not save the repair queue: ${String(err)}`);
  }
}

export const listRepairJobs = () => jobs;

export function enqueueRepairs(items: { hash: string; name: string; sizeBytes: number }[], onFail: OnFail, by: string): RepairJob[] {
  const added: RepairJob[] = [];
  for (const it of items) {
    const active = jobs.find((j) => j.hash === it.hash && (j.state === 'queued' || j.state === 'running'));
    if (active) { added.push(active); continue; }
    const job: RepairJob = { ...it, id: randomUUID(), onFail, by, state: 'queued', step: null, message: null, queuedAt: new Date().toISOString(), finishedAt: null };
    jobs.push(job);
    added.push(job);
  }
  save();
  void pump();
  return added;
}

export function cancelRepair(id: string): boolean {
  const job = jobs.find((j) => j.id === id);
  if (!job || job.state !== 'queued') return false;
  jobs = jobs.filter((j) => j.id !== id);
  save();
  return true;
}

export function clearFinishedRepairs() {
  jobs = jobs.filter((j) => j.state === 'queued' || j.state === 'running');
  save();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    for (let job = jobs.find((j) => j.state === 'queued'); job && !control.paused; job = jobs.find((j) => j.state === 'queued')) {
      await run(job);
      if (!control.paused && jobs.some((j) => j.state === 'queued')) await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_MS));
    }
  } finally {
    running = false;
  }
}

/** A release's file health from zurg's own page for it ("File States OK: 1 Broken: 1").
 *  The state lists lag behind (a fixed release can stay listed as unrepairable), so success is
 *  judged here: every file OK. Null when the page can't be read. */
async function releaseHealth(conn: ZurgConn, hash: string): Promise<{ ok: number; bad: number } | null> {
  const html = await zurgGet<string>(conn, `/manage/${hash}/`, 20_000).catch(() => null);
  if (!html) return null;
  const text = String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const states = /File States (.*?) Total Size/.exec(text)?.[1];
  if (!states) return null;
  let ok = 0;
  let bad = 0;
  for (const m of states.matchAll(/([A-Za-z][A-Za-z ]*?):\s*(\d+)/g)) {
    if (m[1].trim().toLowerCase() === 'ok') ok += Number(m[2]);
    else bad += Number(m[2]);
  }
  return { ok, bad };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Holds a repair request until it is safe to send: the queue isn't paused, the hourly TorBox
 *  budget has room, and zurg has finished whatever repair it is already doing. If zurg stays
 *  busy too long (its worker is stuck, usually TorBox not answering), the queue pauses itself. */
async function waitForTurn(conn: ZurgConn, job: RepairJob) {
  const busySince = Date.now();
  for (;;) {
    if (control.paused) throw new QueuePaused();
    const hourAgo = Date.now() - 3_600_000;
    control.requests = control.requests.filter((t) => t > hourAgo);
    if (control.requests.length >= HOURLY_BUDGET) {
      const resumeAt = new Date(control.requests[0] + 3_600_000);
      job.step = `Hourly TorBox limit reached, resumes about ${resumeAt.toISOString().slice(11, 16)} UTC`;
      save();
      await sleep(Math.min(60_000, resumeAt.getTime() - Date.now() + 1000));
      continue;
    }
    // zurg reports the counter as a string ("0") — compare the number, not truthiness.
    const stats = await zurgGet<{ repair_queue?: number | string }>(conn, '/stats', 10_000).catch(() => null);
    if (!stats || !(Number(stats.repair_queue) > 0)) return;
    if (Date.now() - busySince > ZURG_BUSY_LIMIT_MS) {
      pauseRepairs('Zurg hasn\'t finished a repair in 15 minutes, TorBox is probably slow or rate-limiting. Resume once Zurg is idle again.');
      logEvent('warn', 'Zurg', 'Repair queue paused: zurg repair worker busy for 15 minutes');
      throw new QueuePaused();
    }
    job.step = 'Waiting for Zurg to finish its current repair';
    save();
    await sleep(20_000);
  }
}

async function stateOf(conn: ZurgConn, hash: string): Promise<BrokenState | 'ok'> {
  const list = await listBroken(conn);
  return list.find((b) => b.hash === hash)?.state ?? 'ok';
}

async function run(job: RepairJob) {
  job.state = 'running';
  job.step = 'Asking Zurg to repair';
  save();
  try {
    const conn = await getZurgConn();
    if (!conn) throw new Error('Zurg is not configured');
    let fixed = false;
    for (let attempt = 1; attempt <= ATTEMPTS && !fixed; attempt++) {
      if (attempt > 1) {
        job.step = `Zurg said it can't, trying again (${attempt}/${ATTEMPTS})`;
        save();
        await sleep(RETRY_GAP_MS);
      }
      await waitForTurn(conn, job);
      control.requests.push(Date.now());
      saveControl();
      // A manual repair also clears zurg's "unrepairable" mark, so each attempt is a real retry.
      await axios.post(`${conn.base}/manage/${job.hash}/repair`, null, {
        timeout: 60_000, auth: conn.auth, maxRedirects: 0, validateStatus: (s) => s === 303 || s === 302 || s === 200,
      });
      job.step = attempt === 1 ? 'Waiting for TorBox' : `Waiting for TorBox (try ${attempt}/${ATTEMPTS})`;
      save();
      const deadline = Date.now() + ATTEMPT_MS;
      while (Date.now() < deadline) {
        await sleep(POLL_MS);
        const h = await releaseHealth(conn, job.hash);
        if (h && h.ok > 0 && h.bad === 0) { fixed = true; break; }
        // zurg gave its verdict for this attempt — stop watching and retry
        if ((await stateOf(conn, job.hash)) === 'cannot_repair' && Date.now() > deadline - ATTEMPT_MS + 20_000) break;
      }
    }

    if (fixed) {
      job.state = 'fixed';
      job.message = null;
      logEvent('info', 'Zurg', `Repaired ${job.name} (requested by ${job.by})`);
      return;
    }
    const state = await stateOf(conn, job.hash);

    // Not restorable. Only an unused copy may go — re-checked against Radarr/Sonarr right now.
    const reason = state === 'cannot_repair' ? `Zurg couldn't repair it after ${ATTEMPTS} tries` : `Still broken after ${ATTEMPTS} tries`;
    if (job.onFail === 'trash') {
      job.step = 'Checking it is unused';
      const check = await zurgPost<{ releases?: { hash: string; state?: string }[] }>(conn, '/manage/duplicates/check', { hashes: [job.hash] }, 120_000);
      const use = check.releases?.find((r) => r.hash === job.hash)?.state;
      if (use === 'no_reference') {
        await zurgPost(conn, '/manage/bulk-delete', { hashes: [job.hash] }, 120_000);
        markGone([job.hash]);
        job.state = 'removed';
        job.message = `${reason}, moved to Zurg's trash (restorable for 30 days)`;
        logEvent('info', 'Zurg', `Repair failed for ${job.name}; unused, moved to zurg trash`);
        return;
      }
      job.state = 'failed';
      job.message = `${reason}. Kept: ${use === 'referenced' ? 'Radarr or Sonarr uses it, replace the title there' : 'Zurg couldn\'t confirm it is unused'}`;
      return;
    }
    job.state = 'failed';
    job.message = reason;
  } catch (err) {
    if (err instanceof QueuePaused) {
      job.state = 'queued';            // back in line; resumes when the queue does
      return;
    }
    job.state = 'failed';
    const status = (err as { response?: { status?: number } })?.response?.status;
    job.message = status === 404
      ? 'No longer in Zurg, it was removed or trashed before its turn'
      : `Repair request failed: ${String(err)}`;
    logEvent('warn', 'Zurg', `Repair of ${job.name} failed: ${String(err)}`);
  } finally {
    job.step = null;
    if (job.state !== 'queued') job.finishedAt = new Date().toISOString();
    save();
  }
}

if (jobs.some((j) => j.state === 'queued') && !control.paused) setTimeout(() => void pump(), 20_000);
