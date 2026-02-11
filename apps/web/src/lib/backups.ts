import "server-only";

import fs from "fs/promises";
import path from "path";
import { createClient } from "redis";
import JSZip from "jszip";
import { getPool } from "@/db";
import { logger } from "@/lib/logger";

export type BackupSummary = {
  name: string;
  sizeBytes: number;
  createdAt: string;
};

const DEFAULT_BACKUP_MAX_FILES = 5;

type BackupManifest = {
  version: 1;
  createdAt: string;
  trigger: "manual" | "job" | "script";
  app: {
    name: string;
    commitTag: string;
  };
  postgres: {
    tableCount: number;
  };
  redis: {
    keyCount: number;
  };
};

function getBackupDir() {
  return process.env.BACKUP_DIR?.trim() || "/data/backups";
}

export function getBackupMaxFiles() {
  const raw = process.env.BACKUP_MAX_FILES?.trim();
  if (!raw) return DEFAULT_BACKUP_MAX_FILES;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_BACKUP_MAX_FILES;
  const rounded = Math.floor(parsed);
  if (rounded < 1) return 1;
  if (rounded > 200) return 200;
  return rounded;
}

function safeBackupName(raw: string): string | null {
  const name = raw.trim();
  if (!/^[a-zA-Z0-9._-]+\.zip$/.test(name)) return null;
  if (name.includes("..")) return null;
  return name;
}

async function ensureBackupDir() {
  const dir = getBackupDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function tableIdentifier(name: string) {
  return `"${name.replace(/"/g, "\"\"")}"`;
}

async function collectPostgresSnapshot() {
  const pool = getPool();
  const tableRes = await pool.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name ASC`
  );

  const tableNames = tableRes.rows.map((row) => row.table_name);
  const snapshot: Record<string, unknown[]> = {};

  for (const tableName of tableNames) {
    const query = `SELECT * FROM ${tableIdentifier(tableName)}`;
    const result = await pool.query(query);
    snapshot[tableName] = result.rows;
  }

  return { tableNames, snapshot };
}

type RedisKeyDump = {
  key: string;
  type: string;
  ttlMs: number;
  value: unknown;
};

async function collectRedisSnapshot() {
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    return { keys: [] as RedisKeyDump[] };
  }

  const client = createClient({ url: redisUrl });
  const keys: RedisKeyDump[] = [];

  try {
    await client.connect();
    let cursor = "0";
    do {
      const result = await client.scan(cursor, { COUNT: 250 });
      cursor = result.cursor;
      for (const key of result.keys) {
      const type = await client.type(key);
      const ttlMs = await client.pTTL(key);
      let value: unknown = null;

      if (type === "string") {
        value = await client.get(key);
      } else if (type === "hash") {
        value = await client.hGetAll(key);
      } else if (type === "list") {
        value = await client.lRange(key, 0, -1);
      } else if (type === "set") {
        value = await client.sMembers(key);
      } else if (type === "zset") {
        value = await client.zRangeWithScores(key, 0, -1);
      }

      keys.push({ key, type, ttlMs, value });
      }
    }
    while (cursor !== "0");
  } finally {
    try {
      await client.quit();
    } catch {
      // no-op
    }
  }

  return { keys };
}

function buildBackupName(date = new Date()) {
  const pad = (v: number) => String(v).padStart(2, "0");
  const stamp = `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
  return `lemedia-backup-${stamp}.zip`;
}

export async function listBackups(): Promise<BackupSummary[]> {
  const dir = await ensureBackupDir();
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".zip"));
  const summaries: BackupSummary[] = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    const stats = await fs.stat(fullPath);
    summaries.push({
      name: file.name,
      sizeBytes: stats.size,
      createdAt: stats.mtime.toISOString(),
    });
  }

  return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteBackupArchive(name: string) {
  const fullPath = await getBackupPath(name);
  if (!fullPath) {
    return { ok: false as const, error: "Invalid backup name" };
  }

  try {
    await fs.unlink(fullPath);
    return { ok: true as const };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return { ok: false as const, error: "Backup file not found" };
    }
    logger.error("[Backup] Failed to delete backup", { name, error: err?.message ?? String(error) });
    return { ok: false as const, error: "Failed to delete backup file" };
  }
}

async function enforceBackupRetention() {
  const maxFiles = getBackupMaxFiles();
  const backups = await listBackups();
  if (backups.length <= maxFiles) {
    return { maxFiles, deleted: [] as string[] };
  }

  const toDelete = backups.slice(maxFiles);
  const deleted: string[] = [];
  for (const backup of toDelete) {
    const result = await deleteBackupArchive(backup.name);
    if (result.ok) {
      deleted.push(backup.name);
    }
  }

  if (deleted.length > 0) {
    logger.info("[Backup] Retention removed old backups", { maxFiles, deletedCount: deleted.length, deleted });
  }

  return { maxFiles, deleted };
}

export async function createBackupArchive(options?: { trigger?: "manual" | "job" | "script" }) {
  const dir = await ensureBackupDir();
  const [postgres, redis] = await Promise.all([
    collectPostgresSnapshot(),
    collectRedisSnapshot(),
  ]);

  const manifest: BackupManifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    trigger: options?.trigger ?? "manual",
    app: {
      name: "LeMedia",
      commitTag: process.env.commitTag || process.env.COMMIT_TAG || "unknown",
    },
    postgres: {
      tableCount: postgres.tableNames.length,
    },
    redis: {
      keyCount: redis.keys.length,
    },
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("postgres/tables.json", JSON.stringify(postgres.snapshot, null, 2));
  zip.file("redis/keys.json", JSON.stringify(redis.keys, null, 2));

  const output = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const name = buildBackupName();
  const fullPath = path.join(dir, name);
  await fs.writeFile(fullPath, output);
  const retention = await enforceBackupRetention();

  const stats = await fs.stat(fullPath);
  logger.info("[Backup] Archive created", {
    name,
    sizeBytes: stats.size,
    tableCount: manifest.postgres.tableCount,
    redisKeyCount: manifest.redis.keyCount,
    trigger: manifest.trigger,
    retentionDeleted: retention.deleted.length,
  });

  return {
    name,
    sizeBytes: stats.size,
    createdAt: stats.mtime.toISOString(),
    manifest,
    retention,
  };
}

export async function getBackupPath(name: string) {
  const safe = safeBackupName(name);
  if (!safe) return null;
  const dir = await ensureBackupDir();
  const fullPath = path.join(dir, safe);
  return fullPath;
}

export async function validateBackupArchive(name: string) {
  const fullPath = await getBackupPath(name);
  if (!fullPath) {
    return { ok: false as const, error: "Invalid backup name" };
  }

  let contents: Buffer;
  try {
    contents = await fs.readFile(fullPath);
  } catch {
    return { ok: false as const, error: "Backup file not found" };
  }

  try {
    const zip = await JSZip.loadAsync(contents);
    const required = ["manifest.json", "postgres/tables.json", "redis/keys.json"];
    const missing = required.filter((file) => !zip.file(file));
    if (missing.length) {
      return { ok: false as const, error: `Missing required entries: ${missing.join(", ")}` };
    }

    const manifestRaw = await zip.file("manifest.json")!.async("string");
    const manifest = JSON.parse(manifestRaw) as BackupManifest;
    if (manifest.version !== 1) {
      return { ok: false as const, error: `Unsupported backup version: ${manifest.version}` };
    }

    return {
      ok: true as const,
      details: {
        version: manifest.version,
        createdAt: manifest.createdAt,
        trigger: manifest.trigger ?? "manual",
        tableCount: manifest.postgres.tableCount,
        redisKeyCount: manifest.redis.keyCount,
      },
    };
  } catch (error) {
    logger.warn("[Backup] Validation failed", {
      name,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false as const, error: "Backup file is not a valid archive" };
  }
}
