import { randomUUID } from 'node:crypto';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';
import { getRexConn, rexGet } from './rex.js';
import { helperCall, helperReady, helperStatus } from './rexDockerHelper.js';
import { updateStatus } from './githubIntegration.js';

const SETTINGS = 'rex-docker-update';
type Settings = { autoUpdate?: boolean; lastAuto?: { at: string; result: string } };
type Container = { name: string; image?: string; running?: boolean; exists?: boolean; mode?: string };
type Job = { id: string; status: 'running' | 'done' | 'failed'; phase: string; startedAt: string; finishedAt?: string; error?: string };
const jobs = new Map<string, Job>();
let running: Job | null = null;
let starting = false;
async function read(): Promise<Settings> { const row = await prisma.integration.findUnique({ where: { id: SETTINGS } }); try { return row ? JSON.parse(row.config) : {}; } catch { return {}; } }
async function write(s: Settings) { const config = JSON.stringify(s); await prisma.integration.upsert({ where: { id: SETTINGS }, create: { id: SETTINGS, config }, update: { config } }); }
async function container(): Promise<Container> {
  const result = await helperCall<{ containers: Container[] }>(['containers']);
  const c = result.ok && Array.isArray(result.containers) ? result.containers.find(x => x.name === 'rex') : null;
  if (!c?.exists || !c.running || c.mode !== 'tag') throw new Error('REX Docker container is unavailable or is not configured for exact-tag updates');
  return c;
}
function imageTag(image: string | undefined): string | null { const value = image?.split('/').pop() ?? ''; return value.includes('@') ? null : value.split(':')[1] ?? null; }
export async function rexDockerVersion(): Promise<string | null> {
  if (!(await helperReady())) return null;
  try { return imageTag((await container()).image); } catch { return null; }
}
async function identity(): Promise<string | null> {
  const conn = await getRexConn();
  if (!conn) return null;
  const result = await rexGet<{ MediaContainer?: { machineIdentifier?: string } }>(conn, '/identity', 5000).catch(() => null);
  return result?.MediaContainer?.machineIdentifier || null;
}
export async function rexUpdateSettings() { const s = await read(); return { autoUpdate: !!s.autoUpdate, lastAuto: s.lastAuto ?? null, helper: await helperStatus(), running }; }
export async function setRexAutoUpdate(enabled: boolean) {
  if (enabled && !(await helperReady())) throw new Error('Test the REX host connection before enabling updates');
  await write({ ...(await read()), autoUpdate: enabled }); return rexUpdateSettings();
}
export function getRexUpdateJob(id: string) { return jobs.get(id) ?? null; }
export async function startRexUpdate(source: 'admin' | 'nightly'): Promise<Job> {
  if (running || starting) throw new Error('A REX update is already running');
  starting = true;
  try {
  if (!(await helperReady())) throw new Error('Set up and test the REX host connection first');
  const connection = await getRexConn();
  const helper = await helperStatus();
  if (!connection || new URL(connection.base).hostname.toLowerCase() !== helper.host.toLowerCase()) {
    throw new Error('The REX service and SSH helper must use the same host address');
  }
  const c = await container(); const oldTag = imageTag(c.image);
  if (!oldTag || oldTag === 'latest' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(oldTag)) throw new Error('REX must use a fixed image tag for safe rollback');
  const machine = await identity(); if (!machine) throw new Error('REX is not answering at its configured address');
  const release = await updateStatus('rex', oldTag, true);
  if (!release.connected || release.error || !release.latest?.tag) throw new Error('Connect GitHub and check the REX release feed before updating');
  const tag = release.latest.tag;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(tag)) throw new Error('Invalid REX release tag');
  const job: Job = { id: randomUUID(), status: 'running', phase: 'Preparing REX update', startedAt: new Date().toISOString() };
  jobs.set(job.id, job); running = job;
  void (async () => {
    let updated = false;
    try {
      if (tag === oldTag) { job.phase = `Already on ${tag}`; job.status = 'done'; return; }
      if (source === 'nightly' && !(await read()).autoUpdate) { job.phase = 'Automatic updates are off'; job.status = 'done'; return; }
      job.phase = `Installing ${tag}`;
      updated = true;
      const result = await helperCall(['update', 'rex', tag], 1_200_000);
      if (!result.ok) {
        // The host helper restores its Compose file on failure. Avoid restarting an already
        // healthy server again, for example when the new image could not be pulled.
        updated = (await identity()) !== machine;
        throw new Error(result.error || 'Docker update failed');
      }
      job.phase = 'Checking REX';
      let ready = false;
      for (let i = 0; i < 30; i++) { if (await identity() === machine) { ready = true; break; } await new Promise(resolve => setTimeout(resolve, 3000)); }
      if (!ready) throw new Error('REX did not return with the same identity');
      job.phase = `Updated to ${tag}`; job.status = 'done';
      await logEvent('info', 'REX', `REX update (${source}): ${job.phase}`);
    } catch (error) {
      let message = error instanceof Error ? error.message : 'REX update failed';
      if (updated) {
        job.phase = 'Restoring previous REX image';
        try {
          const rollback = await helperCall(['update', 'rex', oldTag], 1_200_000);
          if (!rollback.ok) message += `; rollback failed: ${rollback.error}`;
          else {
            let recovered = false;
            for (let i = 0; i < 30; i++) { if (await identity() === machine) { recovered = true; break; } await new Promise(resolve => setTimeout(resolve, 3000)); }
            message += recovered ? `; previous image ${oldTag} restored and REX is responding` : `; previous image restored but REX is not responding`;
          }
        }
        catch { message += '; rollback failed'; }
      }
      job.status = 'failed'; job.error = message;
      await logEvent('warn', 'REX', `REX update (${source}) failed: ${message}`);
    } finally { job.finishedAt = new Date().toISOString(); running = null; }
  })();
  return job;
  } finally { starting = false; }
}
export async function nightlyRexUpdate() {
  const settings = await read(); if (!settings.autoUpdate) return { skipped: 'auto-update is off' };
  if (!(await helperReady())) return { skipped: 'host helper not set up' };
  try {
    const job = await startRexUpdate('nightly');
    while (job.status === 'running') await new Promise(resolve => setTimeout(resolve, 5000));
    const result = job.status === 'done' ? job.phase : `Failed: ${job.error}`;
    await write({ ...(await read()), lastAuto: { at: new Date().toISOString(), result } });
    return { status: job.status, result };
  } catch (err) { const result = err instanceof Error ? err.message : 'Update failed'; await write({ ...(await read()), lastAuto: { at: new Date().toISOString(), result } }); return { error: result }; }
}
