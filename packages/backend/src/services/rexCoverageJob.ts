import { getRexConn } from './rex.js';
import { rexShows, rexShowCoverage } from './rexCoverage.js';
import { getCachedEntry, setCache } from '../utils/cache.js';

const CACHE_KEY = 'rex:coverage:v1';
type Show = Awaited<ReturnType<typeof rexShows>>[number];
type Coverage = Awaited<ReturnType<typeof rexShowCoverage>>;
type Snapshot = { serviceId: number; finishedAt: string; shows: Show[]; results: Record<string, Coverage> };
let progress: { running: boolean; done: number; total: number; startedAt: string | null; error: string | null } = { running: false, done: 0, total: 0, startedAt: null, error: null };

export async function getRexCoverageSnapshot() {
  const conn = await getRexConn();
  const cached = await getCachedEntry<Snapshot>(CACHE_KEY);
  // A result from a different configured server must not be shown as the current library.
  return { snapshot: conn && cached?.data.serviceId === conn.serviceId ? cached.data : null, progress };
}

export async function runRexCoverage() {
  const conn = await getRexConn();
  if (!conn) { progress = { ...progress, running: false, error: 'REX is not configured.' }; return { skipped: 'REX not configured' }; }
  progress = { running: true, done: 0, total: 0, startedAt: new Date().toISOString(), error: null };
  try {
    const shows = await rexShows(conn);
    const unique = [...new Map(shows.map(show => [show.key, show])).values()];
    progress.total = unique.length;
    const results: Record<string, Coverage> = {};
    let index = 0;
    let failed = 0;
    async function worker() {
      while (index < unique.length) {
        const show = unique[index++];
        try { results[show.key] = await rexShowCoverage(conn!, show.key); }
        catch { failed++; results[show.key] = { verified: false, reason: 'Could not check REX or TMDB; retry the scan' }; }
        progress.done++;
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, unique.length) }, worker));
    if (unique.length && failed === unique.length) throw new Error('All REX coverage checks failed; previous results retained');
    // Replace only after the inventory and all checks finish, preserving the previous good run.
    await setCache(CACHE_KEY, { serviceId: conn.serviceId, finishedAt: new Date().toISOString(), shows, results } satisfies Snapshot, 365 * 24);
    return { shows: shows.length, checked: unique.length, failed };
  } catch (err) {
    progress = { ...progress, error: 'The REX coverage check failed. Check Tasks for details; previous results are retained.' };
    throw err;
  } finally { progress = { ...progress, running: false }; }
}
