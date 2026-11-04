import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { logEvent } from '../../utils/logEvent.js';
import { getZurgConn } from './client.js';
import { SwapError, swapMovieFile, type SwapResult } from './swap.js';
import { markGone, markReferenced } from './reportOverrides.js';

/**
 * Background queue for movie swaps (see swap.ts). Clicking Swap only enqueues; one worker runs
 * the jobs in order, so any number can be queued and they keep going when the admin leaves the
 * page. One at a time on purpose: each swap deletes a TorBox release and rescans in Radarr, and
 * the stack's rules ask for no bursts against TorBox. The list is saved next to install.json so
 * queued swaps survive a restart; a swap cut off mid-way is marked failed for a manual check.
 */

export type SwapJobState = 'queued' | 'running' | 'done' | 'failed';

export interface SwapJob {
  id: string;
  key: string;
  tmdbId: number;
  title: string;
  dropHash: string;
  keepHash: string;
  keepSize: number;
  currentSize: number;
  by: string;
  state: SwapJobState;
  step: string | null;
  message: string | null;
  result: SwapResult | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

const FILE = join(process.env.INSTALL_FILE_PATH ? dirname(process.env.INSTALL_FILE_PATH) : './data', 'zurg-swaps.json');
const KEEP_FINISHED = 50;

let jobs: SwapJob[] = load();
let running = false;

function load(): SwapJob[] {
  try {
    const list = JSON.parse(readFileSync(FILE, 'utf8')) as SwapJob[];
    return list.map((j) => (j.state === 'running'
      ? { ...j, state: 'failed', step: null, finishedAt: new Date().toISOString(), message: 'LeMedia restarted during this swap, check the movie in Radarr (a rescan usually fixes it)' }
      : j));
  } catch {
    return [];
  }
}

function save() {
  const finished = jobs.filter((j) => j.state === 'done' || j.state === 'failed');
  if (finished.length > KEEP_FINISHED) {
    const drop = new Set(finished.slice(0, finished.length - KEEP_FINISHED).map((j) => j.id));
    jobs = jobs.filter((j) => !drop.has(j.id));
  }
  try {
    writeFileSync(`${FILE}.tmp`, JSON.stringify(jobs));
    renameSync(`${FILE}.tmp`, FILE);
  } catch (err) {
    logEvent('warn', 'Zurg', `Could not save the swap queue: ${String(err)}`);
  }
}

export function listSwapJobs(): SwapJob[] {
  return jobs;
}

export function enqueueSwap(input: Omit<SwapJob, 'id' | 'state' | 'step' | 'message' | 'result' | 'queuedAt' | 'startedAt' | 'finishedAt'>): SwapJob {
  const active = jobs.find((j) => j.tmdbId === input.tmdbId && (j.state === 'queued' || j.state === 'running'));
  if (active) return active;
  const job: SwapJob = { ...input, id: randomUUID(), state: 'queued', step: null, message: null, result: null, queuedAt: new Date().toISOString(), startedAt: null, finishedAt: null };
  jobs.push(job);
  save();
  void pump();
  return job;
}

/** Only a job that hasn't started can be cancelled. */
export function cancelSwap(id: string): boolean {
  const job = jobs.find((j) => j.id === id);
  if (!job || job.state !== 'queued') return false;
  jobs = jobs.filter((j) => j.id !== id);
  save();
  return true;
}

export function clearFinishedSwaps() {
  jobs = jobs.filter((j) => j.state === 'queued' || j.state === 'running');
  save();
}

async function pump() {
  if (running) return;
  running = true;
  try {
    for (let job = next(); job; job = next()) await run(job);
  } finally {
    running = false;
  }
}

function next() {
  return jobs.find((j) => j.state === 'queued');
}

async function run(job: SwapJob) {
  job.state = 'running';
  job.startedAt = new Date().toISOString();
  job.step = 'Checking';
  save();
  try {
    const conn = await getZurgConn();
    if (!conn) throw new SwapError('ZURG_NOT_CONFIGURED', 'Zurg is not configured');
    job.result = await swapMovieFile(conn, job, job.by, (step) => { job.step = step; });
    // Show the swap on the cleanup page now, not after the next analysis.
    markGone([job.dropHash]);
    markReferenced([job.keepHash]);
    job.state = 'done';
    job.message = null;
  } catch (err) {
    job.state = 'failed';
    job.message = err instanceof SwapError ? err.message : `Unexpected error: ${String(err)}`;
    if (!(err instanceof SwapError)) logEvent('error', 'Zurg', `Swap for ${job.title} failed: ${String(err)}`);
  } finally {
    job.step = null;
    job.finishedAt = new Date().toISOString();
    save();
  }
}

// Resume anything that was waiting when the process stopped.
if (jobs.some((j) => j.state === 'queued')) setTimeout(() => void pump(), 15_000);
