import axios from 'axios';
import { getAllServices } from '../utils/services.js';

/**
 * Radarr/Sonarr backup files: list them, trigger one, fetch one.
 *
 * The *arr exposes `GET /api/v3/system/backup` (name, path, type, size, time) and serves the zip
 * from `{base}{path}` with the API key. `POST /api/v3/system/backup` starts "Backup Now", which is
 * the only way to get a Sonarr backup on an install that has never made one.
 *
 * Backups are read from the *arr rather than uploaded by the browser so the DMM page can offer
 * "import this one" on a list, without the admin hunting for a zip on disk.
 */

export class ArrBackupError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'ArrBackupError';
  }
}

export type BackupApp = 'radarr' | 'sonarr';

export interface ArrBackup {
  app: BackupApp;
  id: number;
  name: string;
  type: string;
  size: number;
  /** ISO timestamp from the *arr. */
  time: string;
  /** Server-relative download path from the *arr, e.g. `/backup/scheduled/radarr_….zip`. */
  path: string;
}

export interface BackupList {
  app: BackupApp;
  serviceName: string | null;
  backups: ArrBackup[];
  error: string | null;
}

const LABEL: Record<BackupApp, string> = { radarr: 'Radarr', sonarr: 'Sonarr' };
const TIMEOUT_MS = 20_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60_000;

async function appConfig(app: BackupApp) {
  const [service] = await getAllServices(app);
  const url = service?.config.url?.replace(/\/+$/, '');
  const apiKey = service?.config.apiKey;
  if (!service || !url || !apiKey) throw new ArrBackupError(`${LABEL[app]} is not configured`, 404);
  return { url, apiKey, name: service.name };
}

function toBackup(app: BackupApp, raw: Record<string, unknown>): ArrBackup | null {
  if (typeof raw.name !== 'string' || typeof raw.path !== 'string') return null;
  return {
    app,
    id: typeof raw.id === 'number' ? raw.id : 0,
    name: raw.name,
    type: typeof raw.type === 'string' ? raw.type : 'scheduled',
    size: typeof raw.size === 'number' ? raw.size : 0,
    time: typeof raw.time === 'string' ? raw.time : '',
    path: raw.path,
  };
}

/** Newest first. Throws when the app is unreachable or unconfigured. */
export async function listBackups(app: BackupApp): Promise<{ serviceName: string; backups: ArrBackup[] }> {
  const cfg = await appConfig(app);
  const { data } = await axios.get(`${cfg.url}/api/v3/system/backup`, {
    headers: { 'X-Api-Key': cfg.apiKey, Accept: 'application/json' },
    timeout: TIMEOUT_MS, maxRedirects: 0, validateStatus: () => true,
  }).catch(() => { throw new ArrBackupError(`Could not reach ${LABEL[app]}`, 502); });

  if (!Array.isArray(data)) throw new ArrBackupError(`${LABEL[app]} did not return a backup list`, 502);
  const backups = (data as Record<string, unknown>[])
    .map((raw) => toBackup(app, raw))
    .filter((b): b is ArrBackup => b !== null)
    .sort((a, b) => b.time.localeCompare(a.time));
  return { serviceName: cfg.name, backups };
}

/** Both apps, each failing independently so one outage does not blank the page. */
export async function backupOverview(): Promise<BackupList[]> {
  return Promise.all((['radarr', 'sonarr'] as const).map(async (app) => {
    try {
      const { serviceName, backups } = await listBackups(app);
      return { app, serviceName, backups, error: null };
    } catch (err) {
      const message = err instanceof ArrBackupError ? err.message : `${LABEL[app]} is unavailable`;
      return { app, serviceName: null, backups: [], error: message };
    }
  }));
}

/** Start "Backup Now". The file appears in the list a few seconds later. */
export async function createBackup(app: BackupApp): Promise<void> {
  const cfg = await appConfig(app);
  // "Backup Now" is a command in the Servarr API — /system/backup is read/delete/restore only
  // (POST there answers 405).
  const response = await axios.post(`${cfg.url}/api/v3/command`, { name: 'Backup' }, {
    headers: { 'X-Api-Key': cfg.apiKey },
    timeout: TIMEOUT_MS, maxRedirects: 0, validateStatus: () => true,
  }).catch(() => { throw new ArrBackupError(`Could not reach ${LABEL[app]}`, 502); });
  if (response.status >= 400) throw new ArrBackupError(`${LABEL[app]} refused to start a backup (HTTP ${response.status})`, 502);
}

/**
 * Fetch one backup by name. The name is resolved against the app's own list, so a caller can
 * never ask for an arbitrary path on the *arr host.
 */
export async function downloadBackup(app: BackupApp, name: string, maxBytes: number): Promise<Buffer> {
  const cfg = await appConfig(app);
  const { backups } = await listBackups(app);
  const found = backups.find((b) => b.name === name);
  if (!found) throw new ArrBackupError(`That backup is no longer in ${LABEL[app]} — refresh the list`, 404);
  if (found.size > maxBytes) {
    throw new ArrBackupError(`That backup is ${(found.size / (1024 * 1024)).toFixed(0)} MB, over DMM's 200 MB limit`, 400);
  }

  const { data } = await axios.get(`${cfg.url}${found.path}`, {
    headers: { 'X-Api-Key': cfg.apiKey },
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS,
    maxContentLength: maxBytes,
    maxBodyLength: Infinity,
    maxRedirects: 0,
  }).catch((err) => {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      throw new ArrBackupError(`That backup is no longer on ${LABEL[app]} — refresh the list`, 404);
    }
    throw new ArrBackupError(`Could not download the backup from ${LABEL[app]}`, 502);
  });

  return Buffer.from(data as ArrayBuffer);
}
