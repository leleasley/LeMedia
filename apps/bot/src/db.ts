import { Pool } from "pg";
import { randomBytes } from "crypto";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function withAdvisoryLock<T>(lockId: number, task: () => Promise<T>): Promise<T | null> {
  const p = getPool();
  const lock = await p.query(`SELECT pg_try_advisory_lock($1) AS locked`, [lockId]);
  const locked = Boolean(lock.rows[0]?.locked);
  if (!locked) return null;
  try {
    return await task();
  } finally {
    await p.query(`SELECT pg_advisory_unlock($1)`, [lockId]).catch(() => {});
  }
}

export type LinkedRequestRow = {
  telegramId: string;
  userId: number;
  requestId: string;
  requestType: "movie" | "episode";
  title: string;
  status: string;
  statusReason: string | null;
  tmdbId: number;
  updatedAt: string | null;
};

export type RequestStatusStateRow = {
  telegramId: string;
  requestId: string;
  lastStatus: string;
  lastReason: string | null;
  updatedAt: string;
};

export type TelegramWatchAlert = {
  id: number;
  telegramId: string;
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  active: boolean;
  createdAt: string;
  notifiedAt: string | null;
};

export type LinkedAdminRow = {
  userId: number;
  username: string;
  telegramId: string;
  apiTokenEncrypted: string;
};

export type JobErrorSummary = {
  message: string;
  count: number;
};

export type TriggeredWatchAlertRow = {
  alertId: number;
  telegramId: string;
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  requestId: string;
  requestUpdatedAt: string | null;
};

// Generate a random uppercase alphanumeric code for linking
function generateLinkCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) {
    code += chars[b % chars.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function createLinkToken(telegramId: string, telegramUsername?: string): Promise<string> {
  const p = getPool();
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Delete any existing tokens for this telegram user
  await p.query("DELETE FROM telegram_link_tokens WHERE telegram_id = $1", [telegramId]);

  await p.query(
    `INSERT INTO telegram_link_tokens (code, telegram_id, telegram_username, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [code, telegramId, telegramUsername ?? null, expiresAt]
  );

  return code;
}

export async function getLinkedUser(
  telegramId: string
): Promise<{ userId: number; apiTokenEncrypted: string } | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT tu.user_id, tu.api_token_encrypted
     FROM telegram_users tu
     WHERE tu.telegram_id = $1`,
    [telegramId]
  );
  if (res.rows.length === 0) return null;
  return {
    userId: res.rows[0].user_id,
    apiTokenEncrypted: res.rows[0].api_token_encrypted
  };
}

export async function unlinkTelegramUser(telegramId: string): Promise<void> {
  const p = getPool();
  await p.query("DELETE FROM telegram_users WHERE telegram_id = $1", [telegramId]);
}

export async function upsertWatchAlert(input: {
  telegramId: string;
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
}): Promise<{ created: boolean; alert: TelegramWatchAlert }> {
  const p = getPool();
  const existing = await p.query(
    `SELECT id, telegram_id, user_id, media_type, tmdb_id, title, active, created_at, notified_at
     FROM telegram_watch_alert
     WHERE telegram_id = $1 AND media_type = $2 AND tmdb_id = $3
     LIMIT 1`,
    [input.telegramId, input.mediaType, input.tmdbId]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    const reactivated = !row.active;
    const updated = await p.query(
      `UPDATE telegram_watch_alert
       SET active = TRUE, title = $4
       WHERE telegram_id = $1 AND media_type = $2 AND tmdb_id = $3
       RETURNING id, telegram_id, user_id, media_type, tmdb_id, title, active, created_at, notified_at`,
      [input.telegramId, input.mediaType, input.tmdbId, input.title]
    );
    const row2 = updated.rows[0];
    return {
      created: reactivated,
      alert: {
        id: row2.id,
        telegramId: row2.telegram_id,
        userId: row2.user_id,
        mediaType: row2.media_type,
        tmdbId: row2.tmdb_id,
        title: row2.title,
        active: row2.active,
        createdAt: row2.created_at,
        notifiedAt: row2.notified_at,
      },
    };
  }

  const created = await p.query(
    `INSERT INTO telegram_watch_alert (telegram_id, user_id, media_type, tmdb_id, title, active)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING id, telegram_id, user_id, media_type, tmdb_id, title, active, created_at, notified_at`,
    [input.telegramId, input.userId, input.mediaType, input.tmdbId, input.title]
  );
  const row = created.rows[0];
  return {
    created: true,
    alert: {
      id: row.id,
      telegramId: row.telegram_id,
      userId: row.user_id,
      mediaType: row.media_type,
      tmdbId: row.tmdb_id,
      title: row.title,
      active: row.active,
      createdAt: row.created_at,
      notifiedAt: row.notified_at,
    },
  };
}

export async function listActiveWatchAlerts(telegramId: string): Promise<TelegramWatchAlert[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, telegram_id, user_id, media_type, tmdb_id, title, active, created_at, notified_at
     FROM telegram_watch_alert
     WHERE telegram_id = $1 AND active = TRUE
     ORDER BY created_at DESC`,
    [telegramId]
  );
  return res.rows.map((row) => ({
    id: row.id,
    telegramId: row.telegram_id,
    userId: row.user_id,
    mediaType: row.media_type,
    tmdbId: row.tmdb_id,
    title: row.title,
    active: row.active,
    createdAt: row.created_at,
    notifiedAt: row.notified_at,
  }));
}

export async function disableWatchAlertById(telegramId: string, alertId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE telegram_watch_alert
     SET active = FALSE
     WHERE id = $1 AND telegram_id = $2 AND active = TRUE`,
    [alertId, telegramId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function disableAllWatchAlerts(telegramId: string): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `UPDATE telegram_watch_alert
     SET active = FALSE
     WHERE telegram_id = $1 AND active = TRUE`,
    [telegramId]
  );
  return res.rowCount ?? 0;
}

export async function markWatchAlertNotified(telegramId: string, mediaType: "movie" | "tv", tmdbId: number): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE telegram_watch_alert
     SET notified_at = NOW()
     WHERE telegram_id = $1 AND media_type = $2 AND tmdb_id = $3`,
    [telegramId, mediaType, tmdbId]
  );
}

export async function listTriggeredWatchAlerts(): Promise<TriggeredWatchAlertRow[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT
      twa.id AS alert_id,
      twa.telegram_id,
      twa.user_id,
      twa.media_type,
      twa.tmdb_id,
      twa.title,
      mr.id AS request_id,
      mr.updated_at AS request_updated_at
     FROM telegram_watch_alert twa
     JOIN LATERAL (
       SELECT id, updated_at
       FROM media_request r
       WHERE r.requested_by = twa.user_id
         AND r.tmdb_id = twa.tmdb_id
         AND r.status = 'available'
         AND (
           (twa.media_type = 'movie' AND r.request_type = 'movie') OR
           (twa.media_type = 'tv' AND r.request_type = 'episode')
         )
       ORDER BY coalesce(r.updated_at, r.created_at) DESC
       LIMIT 1
     ) mr ON TRUE
     WHERE twa.active = TRUE`
  );
  return res.rows.map((row) => ({
    alertId: row.alert_id,
    telegramId: row.telegram_id,
    userId: row.user_id,
    mediaType: row.media_type,
    tmdbId: row.tmdb_id,
    title: row.title,
    requestId: row.request_id,
    requestUpdatedAt: row.request_updated_at,
  }));
}

export async function completeWatchAlert(alertId: number): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE telegram_watch_alert
     SET active = FALSE, notified_at = NOW()
     WHERE id = $1`,
    [alertId]
  );
}

export async function listLinkedRequestStatuses(): Promise<LinkedRequestRow[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT
      tu.telegram_id,
      tu.user_id,
      r.id AS request_id,
      r.request_type,
      r.title,
      r.status,
      r.status_reason,
      r.tmdb_id,
      r.updated_at
     FROM telegram_users tu
     JOIN media_request r ON r.requested_by = tu.user_id
     WHERE r.status IN ('downloading', 'available', 'failed')`
  );

  return res.rows.map((row) => ({
    telegramId: row.telegram_id,
    userId: row.user_id,
    requestId: row.request_id,
    requestType: row.request_type,
    title: row.title,
    status: row.status,
    statusReason: row.status_reason,
    tmdbId: row.tmdb_id,
    updatedAt: row.updated_at,
  }));
}

export async function getRequestStatusState(telegramId: string, requestId: string): Promise<RequestStatusStateRow | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT telegram_id, request_id, last_status, last_reason, updated_at
     FROM telegram_request_status_state
     WHERE telegram_id = $1 AND request_id = $2
     LIMIT 1`,
    [telegramId, requestId]
  );
  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    telegramId: row.telegram_id,
    requestId: row.request_id,
    lastStatus: row.last_status,
    lastReason: row.last_reason,
    updatedAt: row.updated_at,
  };
}

export async function upsertRequestStatusState(input: {
  telegramId: string;
  requestId: string;
  lastStatus: string;
  lastReason?: string | null;
}): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO telegram_request_status_state (telegram_id, request_id, last_status, last_reason, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (telegram_id, request_id) DO UPDATE
       SET last_status = EXCLUDED.last_status,
           last_reason = EXCLUDED.last_reason,
           updated_at = NOW()`,
    [input.telegramId, input.requestId, input.lastStatus, input.lastReason ?? null]
  );
}

export async function listLinkedAdmins(): Promise<LinkedAdminRow[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT tu.user_id, tu.telegram_id, tu.api_token_encrypted, u.username
     FROM telegram_users tu
     JOIN app_user u ON u.id = tu.user_id
     WHERE lower(coalesce(u.groups, '')) LIKE '%administrators%'`
  );
  return res.rows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    telegramId: row.telegram_id,
    apiTokenEncrypted: row.api_token_encrypted,
  }));
}

export async function countPendingRequests(): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*)::int AS count
     FROM media_request
     WHERE status = 'pending'`
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function getTopJobErrors(hours = 24, limit = 3): Promise<JobErrorSummary[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT COALESCE(error, 'Unknown error') AS message, COUNT(*)::int AS count
     FROM job_history
     WHERE status = 'failure' AND started_at >= NOW() - ($1::text || ' hours')::interval
     GROUP BY COALESCE(error, 'Unknown error')
     ORDER BY COUNT(*) DESC
     LIMIT $2`,
    [hours, limit]
  );
  return res.rows.map((row) => ({
    message: row.message,
    count: row.count,
  }));
}

export async function isUserAdmin(userId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    "SELECT groups FROM app_user WHERE id = $1",
    [userId]
  );
  if (res.rows.length === 0) return false;

  // groups is stored as a comma-separated string e.g. "administrators,users"
  const raw: string = res.rows[0].groups ?? "";
  const groups = typeof raw === "string"
    ? raw.split(/[;,]/g).map((g: string) => g.trim().toLowerCase()).filter(Boolean)
    : [];

  const LEGACY: Record<string, string> = {
    admin: "administrators", admins: "administrators",
    administrator: "administrators", owner: "administrators"
  };
  return groups.some(g => (LEGACY[g] ?? g) === "administrators");
}
