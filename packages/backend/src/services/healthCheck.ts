import { statSync, statfsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { prisma } from '../utils/prisma.js';
import { getAppSettings, patchAppSettings } from '../utils/appSettings.js';
import { getServiceConfig } from '../utils/services.js';
import { getArrClient } from '../providers/index.js';
import { safeNotify } from '../utils/safeNotify.js';
import { logEvent } from '../utils/logEvent.js';
import { getBackupDir, getDbPath } from './backupService.js';

export interface HealthProblem {
  key: string;
  message: string;
}

/** A problem that persists must not ping every cycle. Re-alert at most this often. */
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Syncs run every 15 min; anything older than this means the sync loop is stuck. */
const SYNC_STALE_MS = 3 * 60 * 60 * 1000;
/** The backup job runs every 6 hours; a day without one means it is failing. */
const BACKUP_STALE_MS = 24 * 60 * 60 * 1000;
/** Free space below this is worth waking someone for. */
const DISK_LOW_BYTES = 1024 * 1024 * 1024;

const lastAlertAt = new Map<string, number>();
const knownProblems = new Set<string>();

function describe(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.split('\n')[0].slice(0, 180);
}

/** Everything worth alerting on, collected without throwing. */
export async function collectHealthProblems(): Promise<HealthProblem[]> {
  const problems: HealthProblem[] = [];

  // 1. Database reachable and answering promptly.
  const dbStart = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    const ms = Date.now() - dbStart;
    if (ms > 5000) {
      problems.push({ key: 'db-slow', message: `Database is responding but took ${(ms / 1000).toFixed(1)}s` });
    }
  } catch (err) {
    problems.push({ key: 'db-down', message: `Database unreachable: ${describe(err)}` });
  }

  // 2. The *arr instances the app depends on.
  for (const type of ['radarr', 'sonarr'] as const) {
    const config = await getServiceConfig(type);
    if (!config?.url || !config?.apiKey) continue; // not configured, nothing to alert about
    try {
      const client = await getArrClient(type);
      await client.getSystemStatus();
    } catch (err) {
      problems.push({ key: `${type}-down`, message: `${type} unreachable: ${describe(err)}` });
    }
  }

  // 3. Syncing actually happening.
  const settings = await getAppSettings();
  if (settings) {
    const pairs: [string, Date | null | undefined][] = [
      ['Radarr', settings.lastRadarrSync],
      ['Sonarr', settings.lastSonarrSync],
    ];
    for (const [label, last] of pairs) {
      if (!last) continue;
      const age = Date.now() - new Date(last).getTime();
      if (age > SYNC_STALE_MS) {
        problems.push({
          key: `sync-stale-${label.toLowerCase()}`,
          message: `Last ${label} sync was ${(age / 3600000).toFixed(1)}h ago, the sync loop looks stuck`,
        });
      }
    }
  }

  // 4. Backups still being taken.
  try {
    const dir = getBackupDir();
    const newest = readdirSync(dir)
      .filter((f) => f.startsWith('lemedia-backup-auto-') && f.endsWith('.zip'))
      .map((f) => statSync(join(dir, f)).mtimeMs)
      .sort((a, b) => b - a)[0];
    if (!newest) {
      problems.push({ key: 'backup-missing', message: 'No automatic backup has ever been created' });
    } else if (Date.now() - newest > BACKUP_STALE_MS) {
      problems.push({
        key: 'backup-stale',
        message: `Newest automatic backup is ${((Date.now() - newest) / 3600000).toFixed(1)}h old`,
      });
    }
  } catch (err) {
    problems.push({ key: 'backup-check-failed', message: `Could not inspect the backup folder: ${describe(err)}` });
  }

  // 5. Disk headroom on the data volume.
  try {
    const stat = statfsSync(dirname(getDbPath()));
    const free = stat.bavail * stat.bsize;
    if (free < DISK_LOW_BYTES) {
      problems.push({
        key: 'disk-low',
        message: `Only ${(free / 1048576).toFixed(0)}MB free on the data volume`,
      });
    }
  } catch (err) {
    problems.push({ key: 'disk-check-failed', message: `Could not check disk space: ${describe(err)}` });
  }

  return problems;
}

/** Make sure the Telegram provider is wired to the incident event, so health alerts
 *  actually reach the configured chat. Other providers' choices for that event are kept. */
async function ensureTelegramIncidentEnabled(): Promise<void> {
  const settings = await getAppSettings();
  if (!settings?.notificationMatrix) return;
  let matrix: Record<string, Record<string, boolean>>;
  try {
    matrix = JSON.parse(settings.notificationMatrix);
  } catch {
    return;
  }
  if (matrix.incident_banner?.telegram === true) return;
  matrix.incident_banner = { ...(matrix.incident_banner || {}), telegram: true };
  await patchAppSettings({ notificationMatrix: JSON.stringify(matrix) });
  logEvent('info', 'Health', 'Enabled Telegram delivery for health/incident alerts');
}

/**
 * Scheduled health check. Alerts on Telegram when something breaks, and again when it
 * recovers — the failure mode this exists for is a job that dies quietly (the backup job
 * went unnoticed for six days).
 */
export async function runHealthMonitor(): Promise<{ ok: boolean; problems: HealthProblem[]; alerted: boolean }> {
  const problems = await collectHealthProblems();
  const now = Date.now();
  let alerted = false;

  if (problems.length > 0) {
    await ensureTelegramIncidentEnabled();
    const toAlert = problems.filter((p) => {
      const last = lastAlertAt.get(p.key);
      return !knownProblems.has(p.key) || last === undefined || now - last > ALERT_COOLDOWN_MS;
    });
    if (toAlert.length > 0) {
      const body = toAlert.map((p) => `❌ ${p.message}`).join('\n');
      safeNotify('incident_banner', { title: 'LeMedia health check', message: body });
      for (const p of toAlert) lastAlertAt.set(p.key, now);
      alerted = true;
      logEvent('error', 'Health', `Health check found ${problems.length} problem(s): ${body}`);
    }
    for (const p of problems) knownProblems.add(p.key);
  } else if (knownProblems.size > 0) {
    // Recovery — say so, otherwise a stale alert looks like the current state.
    safeNotify('incident_banner', {
      title: 'LeMedia health check',
      message: `✅ All checks are passing again (${[...knownProblems].join(', ')} recovered)`,
    });
    lastAlertAt.clear();
    knownProblems.clear();
    alerted = true;
    logEvent('info', 'Health', 'Health check recovered, all systems nominal');
  }

  return { ok: problems.length === 0, problems, alerted };
}
