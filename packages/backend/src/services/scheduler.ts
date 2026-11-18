import { nightlyRexUpdate } from './rexDockerUpdate.js';
import cron, { type ScheduledTask } from 'node-cron';
import { prisma } from '../utils/prisma.js';
import { getAppSettings } from '../utils/appSettings.js';
import { runFullSync, runNewMediaSync } from './sync/index.js';
import { cleanupOrphanedRequests, purgeDeletedRequests } from './requestCleanup.js';
import { vacuumDatabase } from './dbMaintenance.js';
import { runHealthMonitor } from './healthCheck.js';
import { retryFailedRequests } from './requestService.js';
import { getGenreBackdrops } from './tmdb.js';
import { syncMissingKeywords } from './sync/keywordSync.js';
import { syncDigitalReleases } from './sync/digitalReleaseSync.js';
import { pruneBackups, runAutoBackup } from './backupService.js';
import { clearExpiredCache } from '../utils/cache.js';
import type { PluginEngine } from '../plugins/engine.js';
import { logEvent, pruneOldLogs } from '../utils/logEvent.js';
import { getZurgConn, zurgPost } from './zurg/client.js';
import { purgeExpiredResets } from './passwordReset.js';
import { syncLibraryConfirmations } from './mediaServerLibrary.js';
import { runDueSubscriptions } from './lists/engine.js';
import { runPlacementGuard } from './zurg/placementGuard.js';
import { nightlyZurgUpdate } from './zurg/zurgUpdate.js';
import { notifyAppUpdate, watchStack } from './stackWatch.js';
import { runAutoUpdates } from './arrAdmin.js';
import { runRexCoverage } from './rexCoverageJob.js';
import { runPostMigrationJobs } from './postMigrationJobs.js';
import { maintenanceReason } from '../utils/maintenance.js';
import { autoImportNewestBackups } from './dmmWantedImport.js';

/** Strip control characters (newlines, tabs, etc.) to prevent log injection */
function sanitize(input: string): string {
  return input.replaceAll(/[\r\n\t]/g, '');
}

// Map of job keys to their handler functions. `force` is only meaningful for jobs that gate
// work on an age window (currently purge_deleted_requests) — a manual Run bypasses it.
const JOB_HANDLERS: Record<string, (opts?: { force?: boolean }) => Promise<unknown>> = {
  rex_coverage: async () => runRexCoverage(),
  new_media_sync: async () => runNewMediaSync(),
  full_sync: async () => runFullSync(),
  library_scan: async () => syncLibraryConfirmations(),
  cleanup_orphans: async () => {
    const orphans = await cleanupOrphanedRequests();
    // Spent and expired reset tokens have no further use; sweeping them here avoids a second job.
    await purgeExpiredResets();
    return orphans;
  },
  retry_failed_requests: async () => retryFailedRequests(),
  purge_deleted_requests: async (opts) => purgeDeletedRequests(opts?.force ? 0 : 24),
  vacuum_database: async () => vacuumDatabase(),
  health_monitor: async () => runHealthMonitor(),
  genre_backdrops_refresh: async () => getGenreBackdrops(),
  keyword_sync: async () => syncMissingKeywords(),
  digital_release_sync: async () => syncDigitalReleases(),
  auto_backup: async () => runAutoBackup(),
  cache_cleanup: async () => ({ removed: await clearExpiredCache() }),
  log_cleanup: async () => pruneOldLogs(),
  // Fresh duplicate analysis for the Zurg Cleanup page every night (zurg re-reads Radarr and
  // Sonarr, a few minutes of local work; no TorBox calls). Skipped when zurg isn't set up.
  zurg_duplicates_refresh: async () => {
    const conn = await getZurgConn();
    if (!conn) return { skipped: 'zurg not configured' };
    await zurgPost(conn, '/manage/duplicates/refresh', {}, 30_000);
    return { started: true };
  },
  // Admin → Lists: each subscribed list re-syncs once its interval (6 h by default) has passed.
  list_sync: async () => runDueSubscriptions(),
  // Releases Zurg placed that Radarr/Sonarr never imported get a rescan (from media-heal).
  zurg_placement_import: async () => runPlacementGuard(true),
  // Only acts when auto-update is switched on (Zurg → Overview) and the host helper is set up.
  zurg_auto_update: async () => nightlyZurgUpdate(),
  rex_auto_update: async () => nightlyRexUpdate(),
  // Admin notifications: new app versions and newly broken Zurg releases.
  stack_watch: async () => watchStack(),
  // Radarr / Sonarr / Prowlarr with automatic updates on, in their chosen hour.
  arr_auto_update: async () => runAutoUpdates((title, message) => notifyAppUpdate(title, message)),
  // Admin → DMM: import each app's newest backup once. Disabled by default; the DMM page toggles it.
  dmm_auto_import: async () => autoImportNewestBackups(),
};

// `label` is an i18n key resolved by the frontend; plugin jobs with free-text labels fall through.
const DEFAULT_JOBS = [
  { key: 'rex_coverage', label: 'admin.jobs.labels.rex_coverage', cronExpression: '0 5 * * *', enabled: true },
  { key: 'new_media_sync',        label: 'admin.jobs.labels.new_media_sync',        cronExpression: '*/15 * * * *', enabled: true },
  { key: 'full_sync',              label: 'admin.jobs.labels.full_sync',              cronExpression: '0 6 * * *',    enabled: true },
  // Every 30 min: often enough that the IMPORTED window stays short, rare enough not to hammer
  // a Plex server with a full library listing.
  { key: 'library_scan',           label: 'admin.jobs.labels.library_scan',           cronExpression: '*/30 * * * *', enabled: true },
  { key: 'cleanup_orphans',        label: 'admin.jobs.labels.cleanup_orphans',        cronExpression: '0 3 * * *',    enabled: true },
  { key: 'retry_failed_requests',  label: 'admin.jobs.labels.retry_failed_requests',  cronExpression: '*/30 * * * *', enabled: true },
  { key: 'purge_deleted_requests', label: 'admin.jobs.labels.purge_deleted_requests', cronExpression: '0 5 * * *',    enabled: true },
  // SQLite hands freed pages back to the OS only on VACUUM — the log table alone grew the file
  // to 105MB (92MB of it empty). Daily, right after log_cleanup frees the space, in quiet hours.
  { key: 'vacuum_database',       label: 'admin.jobs.labels.vacuum_database',       cronExpression: '30 4 * * *',   enabled: true },
  // Watches the things that fail silently: database, *arr reachability, sync freshness,
  // backup age, disk space. Alerts on Telegram, and again on recovery.
  { key: 'health_monitor',        label: 'admin.jobs.labels.health_monitor',        cronExpression: '*/30 * * * *', enabled: true },
  { key: 'genre_backdrops_refresh', label: 'admin.jobs.labels.genre_backdrops_refresh', cronExpression: '0 4 * * *',   enabled: true },
  { key: 'keyword_sync',           label: 'admin.jobs.labels.keyword_sync',           cronExpression: '0 */1 * * *',  enabled: true },
  { key: 'digital_release_sync',  label: 'admin.jobs.labels.digital_release_sync',  cronExpression: '0 7 * * *',    enabled: true },
  { key: 'auto_backup',            label: 'admin.jobs.labels.auto_backup',            cronExpression: '0 */6 * * *',  enabled: true },
  { key: 'cache_cleanup',          label: 'admin.jobs.labels.cache_cleanup',          cronExpression: '0 3 * * *',    enabled: true },
  { key: 'zurg_duplicates_refresh', label: 'admin.jobs.labels.zurg_duplicates_refresh', cronExpression: '15 4 * * *', enabled: true },
  { key: 'list_sync',              label: 'admin.jobs.labels.list_sync',              cronExpression: '*/15 * * * *', enabled: true },
  { key: 'zurg_placement_import',  label: 'admin.jobs.labels.zurg_placement_import',  cronExpression: '7,22,37,52 * * * *', enabled: true },
  { key: 'rex_auto_update', label: 'admin.jobs.labels.rex_auto_update', cronExpression: '45 6 * * *', enabled: true },
  { key: 'zurg_auto_update',       label: 'admin.jobs.labels.zurg_auto_update',       cronExpression: '30 6 * * *',   enabled: true },
  { key: 'stack_watch',            label: 'admin.jobs.labels.stack_watch',            cronExpression: '*/30 * * * *', enabled: true },
  { key: 'arr_auto_update',        label: 'admin.jobs.labels.arr_auto_update',        cronExpression: '5 * * * *',    enabled: true },
  { key: 'log_cleanup',            label: 'admin.jobs.labels.log_cleanup',            cronExpression: '0 4 * * *',    enabled: true },
  // Off by default: it adds whatever Radarr/Sonarr are missing to the DMM wanted list, and zurg
  // then fetches it. Opt-in from Admin → DMM.
  { key: 'dmm_auto_import',        label: 'admin.jobs.labels.dmm_auto_import',        cronExpression: '0 4 * * *',    enabled: false },
];

const activeTasks = new Map<string, ScheduledTask>();
// Per-key mutex — same job can't double-run (manual + cron tick collision).
const runningJobs = new Set<string>();
const LIBRARY_SYNC_KEYS = new Set(['full_sync', 'new_media_sync']);
let postMigrationTimer: ReturnType<typeof setInterval> | null = null;
let postMigrationDrain: Promise<void> | null = null;
let _pluginEngine: PluginEngine | null = null;

export type RunJobOutcome =
  | { skipped: true; reason: 'already_running' | 'unknown_job' | 'plugin_disabled' | 'maintenance' }
  | { skipped: false; result: unknown };

async function seedJobs() {
  for (const job of DEFAULT_JOBS) {
    // Re-sync label so upgrades pick up the new i18n key; cron + enabled stay user-controlled.
    await prisma.cronJob.upsert({
      where: { key: job.key },
      update: { label: job.label },
      create: job,
    });
  }
}

async function runJob(key: string, opts?: { force?: boolean }): Promise<RunJobOutcome> {
  // Covers requests already past the HTTP maintenance hook when restore starts.
  if (maintenanceReason()) return { skipped: true, reason: 'maintenance' };
  if (runningJobs.has(key) || (LIBRARY_SYNC_KEYS.has(key)
    && [...LIBRARY_SYNC_KEYS].some(syncKey => runningJobs.has(syncKey)))) {
    logEvent('debug', 'Job', `Job "${sanitize(key)}" already running, skipping concurrent trigger`);
    return { skipped: true, reason: 'already_running' };
  }
  runningJobs.add(key);

  const start = Date.now();
  try {
    let handler = JOB_HANDLERS[key];
    if (!handler && _pluginEngine) {
      // Ownership is persisted on the job. A disabled predecessor may declare the same key,
      // so neither manifest order nor a handler cached at boot identifies the current owner.
      const job = await prisma.cronJob.findUnique({ where: { key }, select: { pluginId: true } });
      if (job?.pluginId) {
        const owner = _pluginEngine.getPlugin(job.pluginId);
        if (!owner || !owner.enabled || owner.error) {
          logEvent('debug', 'Job', `Skipping job "${sanitize(key)}" — plugin "${sanitize(job.pluginId)}" is unavailable`);
          return { skipped: true, reason: 'plugin_disabled' };
        }
        handler = _pluginEngine.getJobHandlers()[key];
      }
    }
    if (!handler) return { skipped: true, reason: 'unknown_job' };

    const wasFirstSync = !(await hasCompletedFirstSync());
    const result = await handler(opts);
    const duration = Date.now() - start;
    await prisma.cronJob.update({
      where: { key },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'success',
        lastDuration: duration,
        lastResult: JSON.stringify(result ?? null),
      },
    });
    logEvent('info', 'Job', `Job "${sanitize(key)}" completed in ${duration}ms`);

    // After the first successful full sync, start all cron schedules
    if (wasFirstSync && key === 'full_sync' && activeTasks.size === 0) {
      logEvent('debug', 'Job', 'First full sync done, starting cron schedules');
      await startAllJobs();
    }

    return { skipped: false, result };
  } catch (err) {
    const duration = Date.now() - start;
    await prisma.cronJob.update({
      where: { key },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'error',
        lastDuration: duration,
        lastResult: JSON.stringify({ error: String(err) }),
      },
    });
    logEvent('error', 'Job', `Job "${sanitize(key)}" failed`, err);
    throw err;
  } finally {
    runningJobs.delete(key);
  }
}

function scheduleJob(key: string, cronExpression: string) {
  // Stop existing task if any
  const existing = activeTasks.get(key);
  if (existing) {
    existing.stop();
    activeTasks.delete(key);
  }

  if (!cron.validate(cronExpression)) {
    logEvent('debug', 'Job', `Invalid cron expression for "${sanitize(key)}": ${sanitize(cronExpression)}`);
    return;
  }

  // runJob already logs+writes lastStatus on its own catch, but a synchronous throw before
  // that catch (or a logEvent failure inside it) would otherwise vanish into the cron callback.
  const task = cron.schedule(cronExpression, () => {
    runJob(key).catch((err) => {
      logEvent('error', 'Job', `Cron tick for "${sanitize(key)}" rejected outside runJob: ${String(err)}`);
    });
  });
  activeTasks.set(key, task);
  logEvent('debug', 'Job', `Job "${sanitize(key)}" scheduled: ${sanitize(cronExpression)}`);
}

/** Check if a first full sync has been completed */
async function hasCompletedFirstSync(): Promise<boolean> {
  const settings = await getAppSettings();
  if (settings?.lastRadarrSync || settings?.lastSonarrSync) return true;
  return !!(await prisma.integration.findUnique({ where: { id: 'dmm-initial-sync' } }));
}

/** Start all enabled cron schedules */
async function startAllJobs() {
  const jobs = await prisma.cronJob.findMany();
  for (const job of jobs) {
    if (job.enabled) {
      scheduleJob(job.key, job.cronExpression);
    }
  }
  logEvent('debug', 'Job', `${jobs.filter((j) => j.enabled).length}/${jobs.length} jobs active`);
}

/** Cancel every cron schedule. Used before a restore swaps the database file — a job firing
 *  mid-swap would query a disconnected client. `restartJobs()` brings them back afterwards.
 *  A job already executing keeps running; `runningJobKeys()` lets the caller see that. */
export function stopAllJobs(): void {
  if (postMigrationTimer) clearInterval(postMigrationTimer);
  postMigrationTimer = null;
  for (const [key, task] of activeTasks) {
    task.stop();
    activeTasks.delete(key);
  }
  logEvent('debug', 'Job', 'All cron schedules stopped');
}

/** Re-arm every enabled schedule after a maintenance window. */
export async function restartJobs(): Promise<void> {
  await seedJobs();
  await startAllJobs();
  startPostMigrationJobs();
}

/** Independent of user cron preferences and first-sync gating: SQL queued a one-off upgrade,
 *  not a new schedule. Called only after migrations, plugin init, HTTP listen and job seeding. */
function startPostMigrationJobs(): void {
  if (postMigrationTimer) clearInterval(postMigrationTimer);
  const drain = async () => {
    if (!postMigrationTimer || runningJobs.has('post_migration')) return;
    runningJobs.add('post_migration');
    try {
      await runPostMigrationJobs(async key => {
        // Only explicitly supported, idempotent core jobs may be enqueued by migrations.
        if (key !== 'full_sync') throw new Error('Unsupported post-migration job');
        return runJob(key);
      }, () => !postMigrationTimer);
    } catch {
      await logEvent('error', 'MigrationJob', 'Unable to process migration jobs; retrying on the next tick');
    } finally {
      runningJobs.delete('post_migration');
    }
  };
  const tick = () => {
    if (!postMigrationDrain) postMigrationDrain = drain().finally(() => { postMigrationDrain = null; });
  };
  postMigrationTimer = setInterval(tick, 60_000);
  postMigrationTimer.unref();
  tick();
}

/** After stopping timers and refusing new jobs, let an in-flight queue poll release SQLite. */
export async function settlePostMigrationJobs(): Promise<void> {
  await postMigrationDrain;
}

/** Keys of jobs currently mid-execution. */
export function runningJobKeys(): string[] {
  return [...runningJobs];
}

export async function initScheduler(pluginEngine?: PluginEngine) {
  // Register plugin job handlers and seed their definitions
  if (pluginEngine) {
    _pluginEngine = pluginEngine;
    const pluginJobDefs = pluginEngine.getJobDefs();
    for (const job of pluginJobDefs) {
      await prisma.cronJob.upsert({
        where: { key: job.key },
        update: { pluginId: job.pluginId },
        create: { key: job.key, label: job.label, cronExpression: job.cron, enabled: true, pluginId: job.pluginId },
      });
    }
  }

  await seedJobs();

  // The backup folder may predate a smaller retention (or a crash between runs): trim it now.
  try {
    const removed = pruneBackups();
    if (removed.length > 0) logEvent('info', 'Backup', `Removed ${removed.length} old backup(s) on boot`);
  } catch { /* a missing folder is not an error */ }

  // Only start cron schedules if a first full sync has been done
  if (await hasCompletedFirstSync()) {
    await startAllJobs();
  } else {
    logEvent('debug', 'Job', 'Jobs seeded but not started, waiting for first full sync');
  }
  startPostMigrationJobs();

  // The media-server snapshot backs "already in your library" (request guard, title page) and the
  // catalogue for installs without an *arr. Refresh it at boot instead of waiting up to 30 minutes.
  void syncLibraryConfirmations().catch(() => { /* no media server or unreachable: try later */ });
}

export async function updateJobSchedule(key: string, cronExpression: string, enabled: boolean) {
  const existing = activeTasks.get(key);
  if (existing) {
    existing.stop();
    activeTasks.delete(key);
  }

  if (enabled && cron.validate(cronExpression)) {
    scheduleJob(key, cronExpression);
  }
}

export async function triggerJob(key: string, opts?: { force?: boolean }): Promise<RunJobOutcome> {
  return runJob(key, opts);
}

/** Register a plugin's job definitions after a hot install (loadSingle). Upserts CronJob rows
 *  with pluginId ownership and schedules cron tasks. Throws if a key is already claimed by a
 *  different plugin — collision is unrecoverable from the engine's side. */
export async function registerPluginJobs(
  jobs: { key: string; label: string; cron: string }[],
  pluginId: string,
): Promise<void> {
  for (const job of jobs) {
    const existing = await prisma.cronJob.findUnique({ where: { key: job.key } });
    if (existing && existing.pluginId && existing.pluginId !== pluginId) {
      throw new Error(`Job key "${job.key}" is already owned by plugin "${existing.pluginId}", cannot register for "${pluginId}".`);
    }
    const row = await prisma.cronJob.upsert({
      where: { key: job.key },
      update: { pluginId },
      create: { key: job.key, label: job.label, cronExpression: job.cron, enabled: true, pluginId },
    });
    if (row.enabled) scheduleJob(job.key, row.cronExpression);
  }
}

/** Cancel scheduled timers + drop tracking for every job owned by `pluginId`. The DB rows
 *  are deleted by the engine's uninstall path; this only handles the in-process state. */
export function cancelPluginJobs(pluginId: string, keys: string[]): void {
  for (const key of keys) {
    const task = activeTasks.get(key);
    if (task) {
      task.stop();
      activeTasks.delete(key);
    }
  }
  void pluginId; // tracked in the keys argument; explicit param keeps the call site clear.
}

/** True when `key` is currently mid-run (manual or cron-triggered). Read-only — for status APIs. */
export function isJobRunning(key: string): boolean {
  return runningJobs.has(key);
}

