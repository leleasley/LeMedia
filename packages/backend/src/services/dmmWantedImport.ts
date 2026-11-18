import axios from 'axios';
import { deflateRawSync } from 'node:zlib';
import { prisma } from '../utils/prisma.js';
import { parseServiceConfig } from '../utils/services.js';
import { logEvent } from '../utils/logEvent.js';
import { type BackupApp, backupOverview, downloadBackup, listBackups } from './arrBackups.js';
import { getZurgConn, getZurgStatus } from './zurg/client.js';
import { summarizeDmmSources } from './zurg/dmmStatus.js';

/**
 * Import what Radarr/Sonarr are still looking for into a sponsor's DMM wanted list.
 *
 * DMM reads the *arr's own SQLite database from the backup zip and applies its rules (monitored,
 * missing, minimum availability, aired episodes) itself — reimplementing those rules here would
 * drift. Their page cuts `radarr.db`/`sonarr.db` out of the zip in the browser and posts only that
 * member, still deflated; we do the same on the server, so the rest of the backup (including the
 * *arr API key in config.xml) never leaves the box.
 *
 * The endpoint is gated on a signed sponsor token rather than the sponsor API key, so the key is
 * exchanged first. That exchange is also the entitlement check: a lapsed sponsorship is refused
 * there, which is why no separate permission is modelled here.
 */

export class DmmImportError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = 'DmmImportError';
  }
}

export interface WantedImportResult {
  app: 'radarr' | 'sonarr';
  found: number;
  added: number;
  alreadyWanted: number;
  overCap: number;
  noImdbId: number;
  notAvailable: number;
  /** Sonarr seasons that exist on TVDB but have nothing aired on TMDB — zurg will not fetch them. */
  seasonsTmdbLacks: { title: string; seasons: number[] }[];
}

const LINK_URL = 'https://debridmediamanager.com/api/sponsor/link';
const IMPORT_URL = 'https://debridmediamanager.com/api/wanted/import';
/** DMM's own caps; enforced here too so a bad file fails fast instead of after a 200 MB upload. */
export const MAX_COMPRESSED_BYTES = 200 << 20;
const MAX_UNCOMPRESSED_BYTES = 2 * 1024 ** 3;
/** A 95 MB backup over a home uplink is slow; the import itself is a database read on their side. */
const IMPORT_TIMEOUT_MS = 5 * 60_000;

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

/** Minimal central-directory reader: enough to find one member and take its compressed bytes. */
export function readZipEntries(buf: Buffer): ZipEntry[] {
  // EOCD is the last 22 bytes plus up to 64 KB of trailing comment.
  const scanFrom = Math.max(0, buf.length - 66_000);
  let eocd = -1;
  for (let i = buf.length - 22; i >= scanFrom; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new DmmImportError('That file is not a zip archive');

  const entries = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > buf.length || buf.readUInt32LE(offset) !== 0x02014b50) {
      throw new DmmImportError('That zip archive is damaged');
    }
    const nameLength = buf.readUInt16LE(offset + 28);
    const extraLength = buf.readUInt16LE(offset + 30);
    const commentLength = buf.readUInt16LE(offset + 32);
    out.push({
      method: buf.readUInt16LE(offset + 10),
      compressedSize: buf.readUInt32LE(offset + 20),
      uncompressedSize: buf.readUInt32LE(offset + 24),
      localOffset: buf.readUInt32LE(offset + 42),
      name: buf.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return out;
}

/** The `radarr.db` / `sonarr.db` member's raw deflate stream, ready for DMM's inflater. */
export function extractArrDatabase(zip: Buffer): { app: 'radarr' | 'sonarr'; deflate: Buffer } {
  const entry = readZipEntries(zip).find(({ name }) => /(?:^|\/)(radarr|sonarr)\.db$/i.test(name));
  if (!entry) throw new DmmImportError('That zip has no radarr.db or sonarr.db in it — pick a Radarr or Sonarr backup');
  const app = /sonarr/i.test(entry.name) ? 'sonarr' : 'radarr';

  if (entry.compressedSize > MAX_COMPRESSED_BYTES) throw new DmmImportError('That database is larger than DMM accepts (200 MB compressed)');
  if (entry.uncompressedSize > MAX_UNCOMPRESSED_BYTES) throw new DmmImportError('That database is larger than DMM accepts (2 GB)');
  if (entry.localOffset + 30 > zip.length || zip.readUInt32LE(entry.localOffset) !== 0x04034b50) {
    throw new DmmImportError('That zip archive is damaged');
  }

  const nameLength = zip.readUInt16LE(entry.localOffset + 26);
  const extraLength = zip.readUInt16LE(entry.localOffset + 28);
  const start = entry.localOffset + 30 + nameLength + extraLength;
  const end = start + entry.compressedSize;
  if (end > zip.length) throw new DmmImportError('That zip archive is damaged');

  const payload = zip.subarray(start, end);
  // DMM inflates with raw deflate. Method 8 already is that, so it passes through untouched;
  // a stored entry has to be deflated first.
  if (entry.method === 8) return { app, deflate: payload };
  if (entry.method === 0) return { app, deflate: deflateRawSync(payload) };
  throw new DmmImportError('That backup uses an unsupported compression method');
}

interface SponsorLink {
  token: string;
  name: string | null;
}

/** Sponsor tokens live seven days; keep one per key in memory and re-exchange on refusal. */
let sponsorCache: (SponsorLink & { apiKey: string; expiresAt: number }) | null = null;

export async function dmmService(): Promise<{ id: number; apiKey: string } | null> {
  const rows = await prisma.service.findMany({ where: { type: 'dmm', enabled: true }, orderBy: { id: 'asc' } });
  for (const row of rows) {
    const key = parseServiceConfig(row.config).apiKey?.trim();
    if (key) return { id: row.id, apiKey: key };
  }
  return null;
}

/** Exchange the sponsor API key for a signed token (and the sponsor's name, for the UI). */
async function sponsorLink(apiKey: string, force = false): Promise<SponsorLink> {
  if (!force && sponsorCache && sponsorCache.apiKey === apiKey && sponsorCache.expiresAt > Date.now() + 60_000) {
    return { token: sponsorCache.token, name: sponsorCache.name };
  }

  let response;
  try {
    response = await axios.post(LINK_URL, { apiKey }, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 20_000, maxRedirects: 0, validateStatus: () => true,
    });
  } catch (err) {
    throw new DmmImportError(`Could not reach Debrid Media Manager (${String((err as { code?: string })?.code ?? 'network error')})`, 502);
  }

  const body = response.data as { isSponsor?: boolean; token?: string; expiresIn?: number; githubUsername?: string; error?: string };
  if (response.status === 404) throw new DmmImportError('That DMM API key is not recognised — check the key in Services (Gatekeeper issues it)', 400);
  if (body?.isSponsor !== true || !body.token) {
    throw new DmmImportError(body?.error || 'That DMM key has no active sponsorship', 403);
  }

  const linked: SponsorLink = { token: body.token, name: typeof body.githubUsername === 'string' ? body.githubUsername : null };
  sponsorCache = { ...linked, apiKey, expiresAt: Date.now() + Math.max(60, body.expiresIn ?? 3600) * 1000 };
  return linked;
}

async function postImport(deflate: Buffer, token: string) {
  try {
    return await axios.post(IMPORT_URL, deflate, {
      headers: { 'x-dmm-sponsor': token, 'Content-Type': 'application/octet-stream' },
      timeout: IMPORT_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      maxRedirects: 0,
      validateStatus: () => true,
    });
  } catch (err) {
    throw new DmmImportError(`Could not upload the backup to DMM (${String((err as { code?: string })?.code ?? 'network error')})`, 502);
  }
}

/** Import a Radarr/Sonarr backup zip into the DMM wanted list. The upload is never stored. */
export async function importWantedFromBackup(zip: Buffer): Promise<WantedImportResult> {
  // Extract first: a wrong file is rejected on its own merits, not as "DMM is not configured".
  const { app, deflate } = extractArrDatabase(zip);
  const service = await dmmService();
  if (!service) throw new DmmImportError('Add a Debrid Media Manager service with your sponsor API key first', 400);
  const first = await postImport(deflate, (await sponsorLink(service.apiKey)).token);
  // Token revoked or reset in Gatekeeper: one re-exchange, then let the error through.
  const response = first.status === 401
    ? await postImport(deflate, (await sponsorLink(service.apiKey, true)).token)
    : first;

  if (response.status !== 200) {
    const error = (response.data as { error?: string })?.error;
    if (response.status === 429) throw new DmmImportError('DMM allows 10 imports per hour — try again later', 429);
    if (response.status === 413) throw new DmmImportError('That backup is too large for DMM', 413);
    if (response.status === 401) throw new DmmImportError('DMM refused the sponsorship — check the key in Gatekeeper', 403);
    throw new DmmImportError(error || `DMM rejected the import (HTTP ${response.status})`, 400);
  }

  const body = response.data as Partial<WantedImportResult>;
  const result: WantedImportResult = {
    app: body.app ?? app,
    found: body.found ?? 0,
    added: body.added ?? 0,
    alreadyWanted: body.alreadyWanted ?? 0,
    overCap: body.overCap ?? 0,
    noImdbId: body.noImdbId ?? 0,
    notAvailable: body.notAvailable ?? 0,
    seasonsTmdbLacks: Array.isArray(body.seasonsTmdbLacks) ? body.seasonsTmdbLacks : [],
  };
  logEvent(
    'info',
    'DMM',
    `${result.app} backup imported to the wanted list: ${result.added} added, ${result.alreadyWanted} already wanted`
      + `${result.noImdbId ? `, ${result.noImdbId} without an IMDb id` : ''}`
      + `${result.seasonsTmdbLacks.length ? `, ${result.seasonsTmdbLacks.length} show(s) with seasons TMDB lacks` : ''}`,
  );
  return result;
}

/** What the admin card needs before showing a picker. */
export async function dmmImportStatus(): Promise<{
  configured: boolean;
  sponsor: 'active' | 'lapsed' | 'unknown';
  sponsorName: string | null;
  error: string | null;
}> {
  const service = await dmmService();
  if (!service) return { configured: false, sponsor: 'unknown', sponsorName: null, error: null };

  try {
    const { name } = await sponsorLink(service.apiKey);
    return { configured: true, sponsor: 'active', sponsorName: name, error: null };
  } catch (err) {
    const message = err instanceof DmmImportError ? err.message : 'Could not verify the sponsorship';
    const lapsed = /no active sponsorship|not recognised/i.test(message);
    return { configured: true, sponsor: lapsed ? 'lapsed' : 'unknown', sponsorName: null, error: message };
  }
}

// ─── Import history ─────────────────────────────────────────────────

export interface DmmImportRow {
  id: number;
  app: string;
  backupName: string;
  source: string;
  found: number;
  added: number;
  alreadyWanted: number;
  createdAt: Date;
}

/** Save a finished import. Also the scheduled job's dedupe key: see autoImportNewestBackups. */
export async function recordImport(
  app: 'radarr' | 'sonarr',
  backupName: string,
  source: 'upload' | 'backup' | 'auto',
  result: WantedImportResult,
): Promise<void> {
  await prisma.dmmImport.create({
    data: {
      app,
      backupName,
      source,
      found: result.found,
      added: result.added,
      alreadyWanted: result.alreadyWanted,
    },
  }).catch((err) => logEvent('warn', 'DMM', `Could not record the import: ${String(err)}`));
}

export async function recentImports(limit = 15): Promise<DmmImportRow[]> {
  return prisma.dmmImport.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
}

/** Fetch a backup from the configured *arr and import it, recording the outcome. */
export async function importFromArrBackup(
  app: BackupApp,
  name: string,
  source: 'backup' | 'auto' = 'backup',
): Promise<WantedImportResult> {
  // Fail on a missing DMM service before pulling a ~100 MB backup over the LAN.
  const service = await dmmService();
  if (!service) throw new DmmImportError('Add a Debrid Media Manager service with your sponsor API key first', 400);

  const zip = await downloadBackup(app, name, MAX_COMPRESSED_BYTES);
  const result = await importWantedFromBackup(zip);
  await recordImport(app, name, source, result);
  return result;
}

/**
 * Scheduled job: import the newest backup from each app, once.
 *
 * A backup already recorded for that app is skipped — otherwise a nightly run would re-upload the
 * same archive forever, spending DMM's 10-per-hour budget and marking everything "already wanted".
 * A genuinely new backup (Radarr makes them on its own schedule) is imported on the next run.
 */
export async function autoImportNewestBackups(): Promise<{ app: BackupApp; status: string; added?: number }[]> {
  const out: { app: BackupApp; status: string; added?: number }[] = [];
  for (const app of ['radarr', 'sonarr'] as const) {
    try {
      const { backups } = await listBackups(app);
      const newest = backups[0];
      if (!newest) { out.push({ app, status: 'no backups' }); continue; }

      const seen = await prisma.dmmImport.findFirst({ where: { app, backupName: newest.name }, select: { id: true } });
      if (seen) { out.push({ app, status: 'already imported' }); continue; }

      const result = await importFromArrBackup(app, newest.name, 'auto');
      out.push({ app, status: 'imported', added: result.added });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logEvent('warn', 'DMM', `Scheduled import for ${app} failed: ${message}`);
      out.push({ app, status: `failed: ${message}` });
    }
  }
  return out;
}

/** What zurg reports about DMM jobs. Reads zurg's snapshot, not DMM's list (which would mark it polled). */
export async function dmmZurgSummary() {
  const conn = await getZurgConn().catch(() => null);
  if (!conn) return null;
  const status = await getZurgStatus(conn).catch(() => null);
  return summarizeDmmSources(status);
}

/** Everything the DMM page renders, in one round trip. */
export async function dmmOverview(limit = 15) {
  const [status, backups, imports] = await Promise.all([
    dmmImportStatus(),
    backupOverview(),
    recentImports(limit),
  ]);
  const job = await prisma.cronJob.findUnique({ where: { key: 'dmm_auto_import' } });
  const zurg = await dmmZurgSummary();

  return {
    ...status,
    backups,
    imports,
    zurg,
    autoImport: job
      ? { enabled: job.enabled, cronExpression: job.cronExpression, lastRunAt: job.lastRunAt, lastStatus: job.lastStatus, lastResult: job.lastResult }
      : null,
    limits: { maxBytes: MAX_COMPRESSED_BYTES, importsPerHour: 10 },
  };
}
