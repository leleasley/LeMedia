/**
 * Update Zurg through the host helper: pull the image its compose file names (the nightly
 * `:latest`) and recreate the container, then wait until Zurg answers and its mount is healthy.
 * Optional nightly auto-update runs the same thing when GitHub shows a newer build.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../../utils/prisma.js';
import { logEvent } from '../../utils/logEvent.js';
import { helperCall, helperReady } from '../hostHelper.js';
import { updateStatus } from '../githubIntegration.js';
import { getZurgConn, zurgGet } from './client.js';

const ID = 'zurg-update';
interface Settings { autoUpdate?: boolean; lastAuto?: { at: string; result: string } }

async function read(): Promise<Settings> {
  const row = await prisma.integration.findUnique({ where: { id: ID } });
  try { return row ? JSON.parse(row.config) : {}; } catch { return {}; }
}
async function write(s: Settings) {
  const config = JSON.stringify(s);
  await prisma.integration.upsert({ where: { id: ID }, update: { config }, create: { id: ID, config } });
}

export async function zurgUpdateSettings() {
  const s = await read();
  return { autoUpdate: !!s.autoUpdate, lastAuto: s.lastAuto ?? null, helper: await helperReady() };
}
export async function setZurgAutoUpdate(on: boolean) {
  await write({ ...(await read()), autoUpdate: on });
  return zurgUpdateSettings();
}

export interface ZurgUpdateJob { id: string; status: 'running' | 'done' | 'failed'; phase: string; startedAt: string; finishedAt?: string; error?: string; result?: { before: string | null; after: string | null; changed: boolean } }
const jobs = new Map<string, ZurgUpdateJob>();
let running: ZurgUpdateJob | null = null;
export const getZurgUpdateJob = (id: string) => jobs.get(id) ?? null;
export const runningZurgUpdate = () => running;

async function version(): Promise<string | null> {
  const conn = await getZurgConn();
  if (!conn) return null;
  return (await zurgGet<{ version?: string }>(conn, '/stats', 8_000).catch(() => null))?.version ?? null;
}

export async function startZurgUpdate(source: 'admin' | 'nightly'): Promise<ZurgUpdateJob> {
  if (!(await helperReady())) throw new Error('Updating Zurg needs the host helper (Radarr & Sonarr → Settings)');
  if (running) throw new Error('A Zurg update is already running');
  const job: ZurgUpdateJob = { id: randomUUID(), status: 'running', phase: 'Pulling the latest Zurg image', startedAt: new Date().toISOString() };
  jobs.set(job.id, job);
  running = job;
  void (async () => {
    try {
      const before = await version();
      const r = await helperCall<{ changed?: boolean }>(['pull', 'zurg'], 1_200_000);
      if (!r.ok) throw new Error(r.error ?? 'The update failed');
      job.phase = 'Waiting for Zurg to answer';
      let after: string | null = null;
      const deadline = Date.now() + 180_000;
      while (Date.now() < deadline && !(after = await version())) await new Promise((res) => setTimeout(res, 3000));
      if (!after) throw new Error('Zurg did not answer within 3 minutes of the update');
      job.result = { before, after, changed: !!r.changed || before !== after };
      job.phase = job.result.changed ? `Updated to ${after}` : `Already on the latest build (${after})`;
      job.status = 'done';
      logEvent('info', 'Zurg', `Zurg update (${source}): ${job.phase}`);
    } catch (err) {
      job.status = 'failed';
      job.error = (err as Error).message;
      logEvent('warn', 'Zurg', `Zurg update (${source}) failed: ${job.error}`);
    } finally {
      job.finishedAt = new Date().toISOString();
      running = null;
    }
  })();
  return job;
}

/** Scheduler: when auto-update is on and GitHub shows a newer build, update. */
export async function nightlyZurgUpdate() {
  const s = await read();
  if (!s.autoUpdate) return { skipped: 'auto-update is off' };
  if (!(await helperReady())) return { skipped: 'host helper not set up' };
  const st = await updateStatus('zurg', await version(), true).catch(() => null);
  // Without a GitHub connection we can't tell; pulling is harmless when nothing changed.
  if (st?.connected && st.upToDate) {
    await write({ ...s, lastAuto: { at: new Date().toISOString(), result: 'Already up to date' } });
    return { skipped: 'up to date' };
  }
  const job = await startZurgUpdate('nightly');
  while (job.status === 'running') await new Promise((r) => setTimeout(r, 5000));
  await write({ ...(await read()), lastAuto: { at: new Date().toISOString(), result: job.status === 'done' ? job.phase : `Failed: ${job.error}` } });
  return { status: job.status, phase: job.phase, error: job.error };
}
