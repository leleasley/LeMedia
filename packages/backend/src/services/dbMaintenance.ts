import { statSync } from 'node:fs';
import { prisma } from '../utils/prisma.js';
import { logEvent } from '../utils/logEvent.js';
import { getDbPath } from './backupService.js';

/** Run SQLite's integrity check. Returns every problem it finds (it reports one row per
 *  issue, and "ok" when the file is sound). */
async function integrityStatus(): Promise<{ ok: boolean; details: string[] }> {
  const rows = await prisma.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check');
  const details = (rows ?? []).map((r) => String(r.integrity_check));
  return { ok: details.length === 1 && details[0].toLowerCase() === 'ok', details };
}

/** How many free pages to release per run. 2000 pages ≈ 8MB at the default 4KB page size —
 *  enough to keep pace with the daily log prune without a long exclusive lock. */
const INCREMENTAL_PAGES = 2000;

/**
 * Reclaim SQLite's free pages and repair index inconsistencies.
 *
 * SQLite never returns freed pages to the OS, so a table that churns (the log table, pruned
 * daily) leaves the file at its high-water mark forever. On a 13.5k-media instance the live
 * database had grown to 105MB of which 92MB (87.8% of pages) were empty — a vacuumed copy of
 * the same data was 8.7MB. Every query then pays for the bloated file (more pages to walk,
 * heavier WAL checkpoints, slower backups).
 *
 * This uses `PRAGMA incremental_vacuum`, NOT a full `VACUUM`, and that distinction matters:
 * a full VACUUM rebuilds the database into a new file and swaps it in. Under WAL that swap
 * orphans the -wal file of any connection still holding the old inode, and committed
 * transactions sitting in that WAL are lost — it was observed here taking a committed write
 * back to its previous value. Incremental vacuum releases free pages in place, with no file
 * swap and no risk to the WAL. It requires the database to be in `auto_vacuum=INCREMENTAL`
 * mode (set once, during a controlled stop).
 *
 * It also does NOT repair a broken index, so the integrity check runs first: an interrupted
 * write (a delete cancelled by the query timeout) can leave an index with the wrong number of
 * entries, which then fails every backup's integrity check. REINDEX rebuilds the indexes from
 * the table data and costs ~0.7s here.
 */
export async function vacuumDatabase(): Promise<{
  beforeMB: number;
  afterMB: number;
  durationMs: number;
  reindexed: boolean;
  integrity: string;
}> {
  const dbPath = getDbPath();
  const before = statSync(dbPath).size;
  const started = Date.now();

  // Repair first. REINDEX rebuilds index pages in place — no file swap, so it is safe on a
  // live WAL database.
  let reindexed = false;
  const initial = await integrityStatus();
  if (!initial.ok) {
    logEvent('warn', 'Maintenance', `Integrity check failed (${initial.details.slice(0, 3).join('; ')}), rebuilding indexes`);
    await prisma.$executeRawUnsafe('REINDEX;').catch(() => {});
    reindexed = true;
  }

  // Release free pages in place. No file swap, so no WAL is orphaned.
  // NOTE: PRAGMA incremental_vacuum RETURNS a row (the number of pages freed), and Prisma's
  // $executeRawUnsafe rejects any statement that returns results — it has to go through
  // $queryRawUnsafe, or the job fails with "Execute returned results".
  await prisma.$queryRawUnsafe(`PRAGMA incremental_vacuum(${INCREMENTAL_PAGES});`);

  const after = statSync(dbPath).size;
  const final = await integrityStatus();
  if (!final.ok) {
    throw new Error(`Database integrity check failed after repair: ${final.details.slice(0, 5).join('; ')}`);
  }

  const result = {
    beforeMB: +(before / 1048576).toFixed(1),
    afterMB: +(after / 1048576).toFixed(1),
    durationMs: Date.now() - started,
    reindexed,
    integrity: 'ok',
  };
  logEvent(
    'info',
    'Maintenance',
    `Incremental vacuum: ${result.beforeMB} MB → ${result.afterMB} MB in ${result.durationMs}ms`
    + (reindexed ? ' (indexes rebuilt)' : ''),
  );
  return result;
}
