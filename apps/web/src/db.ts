import { Pool } from "pg";
import { randomUUID } from "crypto";
import { z } from "zod";
import { withCache } from "@/lib/local-cache";
import cacheManager from "@/lib/cache-manager";
import { defaultDashboardSliders, type DashboardSlider } from "@/lib/dashboard-sliders";
import { logger } from "@/lib/logger";
import { validateEnv } from "@/lib/env-validation";

const DatabaseUrlSchema = z.string().min(1);
let cachedDatabaseUrl: string | null = null;

let pool: Pool | null = null;
export function getPool(): Pool {
  if (!pool) {
    validateEnv();
    if (!cachedDatabaseUrl) {
      cachedDatabaseUrl = DatabaseUrlSchema.parse(process.env.DATABASE_URL);
    }
    pool = new Pool({
      connectionString: cachedDatabaseUrl,
      // Optimized connection pool settings (based on Seerr best practices)
      max: Number(process.env.DB_POOL_MAX ?? "50"), // Maximum pool size (default: 10 is too low)
      min: Number(process.env.DB_POOL_MIN ?? "2"), // Minimum idle connections
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT ?? "30000"), // Close idle connections after 30s
      connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT ?? "2000"), // Wait max 2s for connection
      // Prevent connection leaks and improve reliability
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      // Query timeout (prevents hung queries)
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT ?? "30000"), // 30 seconds
      query_timeout: Number(process.env.DB_QUERY_TIMEOUT ?? "30000"),
    });

    // Handle pool errors gracefully
    pool.on("error", (err) => {
      logger.error("[DB] Unexpected database pool error", err);
    });
  }
  return pool;
}

export const ACTIVE_REQUEST_STATUSES = ["queued", "pending", "submitted"] as const;
export type ActiveRequestStatus = (typeof ACTIVE_REQUEST_STATUSES)[number];

export class ActiveRequestExistsError extends Error {
  requestId?: string;
  constructor(message: string, requestId?: string) {
    super(message);
    this.name = "ActiveRequestExistsError";
    this.requestId = requestId;
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const p = getPool();
    await p.query("SELECT 1");
    return true;
  } catch (err) {
    logger.error("[DB] Health check failed", err);
    return false;
  }
}

export async function upsertUser(username: string, groups: string[]): Promise<{ id: number }> {
  const lastSeenMinutes = Math.max(1, Number(process.env.USER_LAST_SEEN_INTERVAL_MINUTES ?? "5") || 5);
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO app_user (username, groups, last_seen_at)
    VALUES ($1, $2, NOW())
    ON CONFLICT (username)
    DO UPDATE SET
      groups = EXCLUDED.groups,
      last_seen_at = CASE
        WHEN app_user.last_seen_at < NOW() - make_interval(mins => $3)
        THEN NOW()
        ELSE app_user.last_seen_at
      END
    RETURNING id
    `,
    [username, groups.join(","), lastSeenMinutes]
  );
  if (!res.rows.length) {
    throw new Error(`Failed to upsert user: ${username}`);
  }
  return { id: res.rows[0].id as number };
}

export async function getPendingRequestCount(): Promise<number> {
  const p = getPool();
  const res = await p.query(`SELECT COUNT(*) as count FROM media_request WHERE status IN ('pending', 'queued')`);
  if (!res.rows.length) return 0;
  return parseInt(res.rows[0].count, 10);
}

export async function getRequestCounts(): Promise<{
  total: number;
  movie: number;
  episode: number;
  pending: number;
  submitted: number;
  available: number;
  failed: number;
}> {
  const p = getPool();
  const res = await p.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(CASE WHEN request_type = 'movie' THEN 1 END)::int AS movie,
      COUNT(CASE WHEN request_type = 'episode' THEN 1 END)::int AS episode,
      COUNT(CASE WHEN status IN ('pending', 'queued') THEN 1 END)::int AS pending,
      COUNT(CASE WHEN status = 'submitted' THEN 1 END)::int AS submitted,
      COUNT(CASE WHEN status = 'available' THEN 1 END)::int AS available,
      COUNT(CASE WHEN status IN ('failed', 'denied') THEN 1 END)::int AS failed
    FROM media_request
    `
  );
  if (!res.rows.length) {
    return { total: 0, movie: 0, episode: 0, pending: 0, submitted: 0, available: 0, failed: 0 };
  }
  const row = res.rows[0];
  return {
    total: Number(row.total ?? 0),
    movie: Number(row.movie ?? 0),
    episode: Number(row.episode ?? 0),
    pending: Number(row.pending ?? 0),
    submitted: Number(row.submitted ?? 0),
    available: Number(row.available ?? 0),
    failed: Number(row.failed ?? 0),
  };
}

export type UpgradeFinderHint = {
  mediaType: "movie" | "tv";
  mediaId: number;
  status: "available" | "none" | "error";
  hintText: string | null;
  checkedAt: string | null;
};

export type UpgradeFinderOverride = {
  mediaType: "movie" | "tv";
  mediaId: number;
  ignore4k: boolean;
  updatedAt: string | null;
};

export async function createRequest(input: {
  requestType: "movie" | "episode";
  tmdbId: number;
  title: string;
  userId: number;
  status?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  releaseYear?: number | null;
}): Promise<{ id: string }> {
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO media_request (
      request_type,
      tmdb_id,
      title,
      requested_by,
      status,
      poster_path,
      backdrop_path,
      release_year
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
    `,
    [
      input.requestType,
      input.tmdbId,
      input.title,
      input.userId,
      input.status ?? "queued",
      input.posterPath ?? null,
      input.backdropPath ?? null,
      input.releaseYear ?? null
    ]
  );
  if (!res.rows.length) {
    throw new Error(`Failed to create media request for tmdbId ${input.tmdbId}`);
  }
  return { id: res.rows[0].id as string };
}

export type RequestItemInput = {
  provider: "sonarr" | "radarr";
  providerId?: number | null;
  season?: number | null;
  episode?: number | null;
  status?: string;
};

export async function createRequestWithItemsTransaction(input: {
  requestType: "movie" | "episode";
  tmdbId: number;
  title: string;
  userId: number;
  requestStatus?: string;
  finalStatus?: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  releaseYear?: number | null;
  items: RequestItemInput[];
}): Promise<{ id: string }> {
  const requestStatus = input.requestStatus ?? "queued";
  const client = await getPool().connect();
  let clientReleased = false;

  try {
    await client.query("BEGIN");

    const res = await client.query(
      `
      INSERT INTO media_request (
        request_type,
        tmdb_id,
        title,
        requested_by,
        status,
        poster_path,
        backdrop_path,
        release_year
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
      `,
      [
        input.requestType,
        input.tmdbId,
        input.title,
        input.userId,
        requestStatus,
        input.posterPath ?? null,
        input.backdropPath ?? null,
        input.releaseYear ?? null
      ]
    );

    const requestId = res.rows[0]?.id as string | undefined;
    if (!requestId) {
      throw new Error("Failed to create request");
    }

    for (const item of input.items) {
      await client.query(
        `
        INSERT INTO request_item (request_id, provider, provider_id, season, episode, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          requestId,
          item.provider,
          item.providerId ?? null,
          item.season ?? null,
          item.episode ?? null,
          item.status ?? requestStatus
        ]
      );
    }

    if (input.finalStatus && input.finalStatus !== requestStatus) {
      await client.query(`UPDATE media_request SET status = $2 WHERE id = $1`, [requestId, input.finalStatus]);
    }

    await client.query("COMMIT");
    return { id: requestId };
  } catch (err: any) {
    // Rollback transaction on any error
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      logger.error("[DB] Transaction rollback failed", rollbackErr);
    }

    // Handle duplicate key error (unique constraint violation)
    if (err?.code === "23505") {
      // Release client before using pool for new query
      client.release();
      clientReleased = true;

      try {
        const pool = getPool();
        const existingRes = await pool.query(
          `
          SELECT id
          FROM media_request
          WHERE request_type = $1
            AND tmdb_id = $2
            AND status = ANY($3::text[])
          ORDER BY created_at DESC
          LIMIT 1
          `,
          [input.requestType, input.tmdbId, ACTIVE_REQUEST_STATUSES]
        );
        const existingId = existingRes.rows[0]?.id as string | undefined;
        throw new ActiveRequestExistsError("Active request already exists", existingId);
      } catch (queryErr) {
        // If query for existing request fails, still throw the duplicate error
        logger.error("[DB] Failed to query existing request after duplicate error", queryErr);
        throw new ActiveRequestExistsError("Active request already exists", undefined);
      }
    }

    // Re-throw original error
    throw err;
  } finally {
    // Ensure client is always released
    if (!clientReleased) {
      client.release();
    }
  }
}

export async function findActiveRequestByTmdb(input: { requestType: "movie" | "episode"; tmdbId: number }) {
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, status, created_at
    FROM media_request
    WHERE request_type = $1
      AND tmdb_id = $2
      AND status IN ('queued','pending','submitted')
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [input.requestType, input.tmdbId]
  );
  if (!res.rows.length) return null;
  return {
    id: res.rows[0].id as string,
    status: res.rows[0].status as string,
    created_at: res.rows[0].created_at as string
  };
}

export async function findActiveRequestsByTmdbIds(input: { requestType: "movie" | "episode"; tmdbIds: number[] }) {
  if (!input.tmdbIds.length) return [];
  const p = getPool();
  const res = await p.query(
    `
    SELECT tmdb_id, id, status
    FROM media_request
    WHERE request_type = $1
      AND tmdb_id = ANY($2::int[])
      AND status IN ('queued','pending','submitted')
    `,
    [input.requestType, input.tmdbIds]
  );
  return res.rows as Array<{ tmdb_id: number; id: string; status: string }>;
}

export async function findActiveEpisodeRequestItems(input: { tmdbTvId: number; season: number; episodeNumbers: number[] }) {
  if (!input.episodeNumbers.length) return [];
  const p = getPool();
  const res = await p.query(
    `
    SELECT i.season, i.episode, r.id as request_id, r.status as request_status
    FROM request_item i
    JOIN media_request r ON r.id = i.request_id
    WHERE r.request_type = 'episode'
      AND r.tmdb_id = $1
      AND i.season = $2
      AND i.episode = ANY($3::int[])
      AND r.status IN ('queued','pending','submitted')
    `,
    [input.tmdbTvId, input.season, input.episodeNumbers]
  );
  return res.rows as Array<{ season: number; episode: number; request_id: string; request_status: string }>;
}

export async function listActiveEpisodeRequestItemsByTmdb(tmdbTvId: number) {
  const p = getPool();
  const res = await p.query(
    `
    SELECT i.season, i.episode, r.id as request_id, r.status as request_status
    FROM request_item i
    JOIN media_request r ON r.id = i.request_id
    WHERE r.request_type = 'episode'
      AND r.tmdb_id = $1
      AND r.status IN ('queued','pending','submitted')
    ORDER BY i.season ASC, i.episode ASC
    `,
    [tmdbTvId]
  );
  return res.rows as Array<{ season: number; episode: number; request_id: string; request_status: string }>;
}

export async function addRequestItem(input: {
  requestId: string;
  provider: "sonarr" | "radarr";
  providerId?: number | null;
  season?: number | null;
  episode?: number | null;
  status?: string;
}) {
  const p = getPool();
  await p.query(
    `
    INSERT INTO request_item (request_id, provider, provider_id, season, episode, status)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [input.requestId, input.provider, input.providerId ?? null, input.season ?? null, input.episode ?? null, input.status ?? "queued"]
  );
}

export async function listRecentRequests(limit = 25, username?: string) {
  return withCache(`recent_requests:${limit}:${username ?? 'all'}`, 60 * 1000, async () => {
    const p = getPool();
    const query = username
      ? `
        SELECT r.id, r.request_type, r.tmdb_id, r.title, r.status, r.created_at,
               r.poster_path, r.backdrop_path, r.release_year,
               u.username, u.avatar_url, u.jellyfin_user_id
        FROM media_request r
        JOIN app_user u ON u.id = r.requested_by
        WHERE u.username = $2
        ORDER BY r.created_at DESC
        LIMIT $1
        `
      : `
        SELECT r.id, r.request_type, r.tmdb_id, r.title, r.status, r.created_at,
               r.poster_path, r.backdrop_path, r.release_year,
               u.username, u.avatar_url, u.jellyfin_user_id
        FROM media_request r
        JOIN app_user u ON u.id = r.requested_by
        ORDER BY r.created_at DESC
        LIMIT $1
        `;
    const res = username
      ? await p.query(query, [limit, username])
      : await p.query(query, [limit]);
    return res.rows as Array<{
      id: string;
      request_type: string;
      tmdb_id: number;
      title: string;
      status: string;
      created_at: string;
      poster_path: string | null;
      backdrop_path: string | null;
      release_year: number | null;
      username: string;
      avatar_url: string | null;
      jellyfin_user_id: string | null;
    }>;
  });
}

export async function listRequestsByUsername(username: string, limit = 100) {
  const p = getPool();
  const res = await p.query(
    `
    SELECT r.id, r.request_type, r.tmdb_id, r.title, r.status, r.created_at,
           r.poster_path, r.backdrop_path, r.release_year,
           u.username
    FROM media_request r
    JOIN app_user u ON u.id = r.requested_by
    WHERE u.username = $1
    ORDER BY r.created_at DESC
    LIMIT $2
    `,
    [username, limit]
  );
  return res.rows as Array<{
    id: string;
    request_type: string;
    tmdb_id: number;
    title: string;
    status: string;
    created_at: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_year: number | null;
    username: string;
  }>;
}

export async function getUserRequestStats(username: string): Promise<{
  total: number;
  movie: number;
  episode: number;
  pending: number;
  available: number;
  failed: number;
}> {
  const p = getPool();
  const res = await p.query(
    `
    WITH target_user AS (
      SELECT id
      FROM app_user
      WHERE username = $1
      LIMIT 1
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(CASE WHEN r.request_type = 'movie' THEN 1 END)::int AS movie,
      COUNT(CASE WHEN r.request_type = 'episode' THEN 1 END)::int AS episode,
      COUNT(CASE WHEN r.status IN ('pending', 'queued', 'submitted') THEN 1 END)::int AS pending,
      COUNT(CASE WHEN r.status = 'available' THEN 1 END)::int AS available,
      COUNT(CASE WHEN r.status IN ('failed', 'denied') THEN 1 END)::int AS failed
    FROM media_request r
    JOIN target_user u ON u.id = r.requested_by
    `,
    [username]
  );
  if (!res.rows.length) {
    return { total: 0, movie: 0, episode: 0, pending: 0, available: 0, failed: 0 };
  }
  const row = res.rows[0];
  return {
    total: Number(row.total ?? 0),
    movie: Number(row.movie ?? 0),
    episode: Number(row.episode ?? 0),
    pending: Number(row.pending ?? 0),
    available: Number(row.available ?? 0),
    failed: Number(row.failed ?? 0),
  };
}

export async function listRequests(limit = 100) {
  return listRecentRequests(limit);
}

export async function listRequestsPaged(input: {
  limit: number;
  offset: number;
  statuses?: string[];
  requestType?: "movie" | "episode";
  requestedById?: number | null;
}): Promise<{ total: number; results: Array<{ id: string; request_type: string; tmdb_id: number; title: string; status: string; created_at: string; username: string; user_id: number; poster_path: string | null; backdrop_path: string | null; release_year: number | null }> }> {
  const p = getPool();
  const where: string[] = [];
  const values: Array<string | number | string[]> = [];
  let idx = 1;

  if (input.statuses && input.statuses.length) {
    where.push(`r.status = ANY($${idx++}::text[])`);
    values.push(input.statuses);
  }
  if (input.requestType) {
    where.push(`r.request_type = $${idx++}`);
    values.push(input.requestType);
  }
  if (Number.isFinite(input.requestedById ?? NaN)) {
    where.push(`u.id = $${idx++}`);
    values.push(Number(input.requestedById));
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const countRes = await p.query(
    `
    SELECT COUNT(*) as count
    FROM media_request r
    JOIN app_user u ON u.id = r.requested_by
    ${whereClause}
    `,
    values
  );
  const total = parseInt(countRes.rows[0]?.count ?? "0", 10);

  values.push(input.limit);
  const limitIdx = idx++;
  values.push(input.offset);
  const offsetIdx = idx++;

  const res = await p.query(
    `
    SELECT r.id, r.request_type, r.tmdb_id, r.title, r.status, r.created_at,
           r.poster_path, r.backdrop_path, r.release_year,
           u.username, u.id as user_id
    FROM media_request r
    JOIN app_user u ON u.id = r.requested_by
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${limitIdx}
    OFFSET $${offsetIdx}
    `,
    values
  );

  return {
    total,
    results: res.rows.map(r => ({
      id: r.id as string,
      request_type: r.request_type as string,
      tmdb_id: Number(r.tmdb_id),
      title: r.title as string,
      status: r.status as string,
      created_at: r.created_at as string,
      username: r.username as string,
      user_id: Number(r.user_id),
      poster_path: r.poster_path ?? null,
      backdrop_path: r.backdrop_path ?? null,
      release_year: r.release_year !== null ? Number(r.release_year) : null
    }))
  };
}

export async function searchUsersByJellyfinUsername(username: string): Promise<Array<{ id: number; username: string; jellyfin_username: string | null }>> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, jellyfin_username
    FROM app_user
    WHERE LOWER(jellyfin_username) = LOWER($1)
       OR LOWER(username) = LOWER($1)
    `,
    [username]
  );
  return res.rows.map(row => ({
    id: Number(row.id),
    username: row.username as string,
    jellyfin_username: row.jellyfin_username ?? null
  }));
}

export async function getRequestById(requestId: string) {
  const p = getPool();
  const res = await p.query(
    `
    SELECT r.id, r.request_type, r.tmdb_id, r.title, r.status, r.created_at,
           r.poster_path, r.backdrop_path, r.release_year, r.requested_by,
           u.username
    FROM media_request r
    JOIN app_user u ON u.id = r.requested_by
    WHERE r.id = $1
    LIMIT 1
    `,
    [requestId]
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: r.id as string,
    request_type: r.request_type as string,
    tmdb_id: r.tmdb_id as number,
    title: r.title as string,
    status: r.status as string,
    created_at: r.created_at as string,
    poster_path: r.poster_path ?? null,
    backdrop_path: r.backdrop_path ?? null,
    release_year: r.release_year !== null ? Number(r.release_year) : null,
    user_id: r.requested_by as number,
    username: r.username as string
  };
}

export async function listRequestItems(requestId: string) {
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, provider, provider_id, season, episode, status, created_at
    FROM request_item
    WHERE request_id = $1
    ORDER BY id ASC
    `,
    [requestId]
  );
  return res.rows as Array<{
    id: number;
    provider: "sonarr" | "radarr";
    provider_id: number | null;
    season: number | null;
    episode: number | null;
    status: string;
    created_at: string;
  }>;
}

export async function setRequestItemsStatus(requestId: string, status: string) {
  const p = getPool();
  await p.query(`UPDATE request_item SET status=$2 WHERE request_id=$1`, [requestId, status]);
}

export async function setRequestItemsProviderId(requestId: string, providerId: number | null) {
  const p = getPool();
  await p.query(`UPDATE request_item SET provider_id=$2 WHERE request_id=$1`, [requestId, providerId]);
}

export type RequestSyncItem = {
  id: number;
  provider: "sonarr" | "radarr";
  provider_id: number | null;
  season: number | null;
  episode: number | null;
  status: string;
};

export type RequestForSync = {
  id: string;
  request_type: "movie" | "episode";
  tmdb_id: number;
  title: string;
  status: string;
  created_at: string;
  requested_by: number;
  username: string;
  items: RequestSyncItem[];
};

export async function listRequestsForSync(limit = 100): Promise<RequestForSync[]> {
  const p = getPool();
  const res = await p.query(
    `
    SELECT
      r.id,
      r.request_type,
      r.tmdb_id,
      r.title,
      r.status,
      r.created_at,
      r.requested_by,
      u.username AS requested_by_username,
      COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'id', i.id,
            'provider', i.provider,
            'provider_id', i.provider_id,
            'season', i.season,
            'episode', i.episode,
            'status', i.status
          )
          ORDER BY i.id
        ) FILTER (WHERE i.id IS NOT NULL),
        '[]'::jsonb
      ) AS items
    FROM media_request r
    JOIN request_item i ON i.request_id = r.id
    JOIN app_user u ON u.id = r.requested_by
    WHERE r.status IN ('submitted', 'downloading', 'available', 'partially_available', 'removed')
    GROUP BY r.id, u.username
    ORDER BY r.created_at ASC
    LIMIT $1
    `,
    [limit]
  );
  return res.rows.map(row => ({
    id: row.id,
    request_type: row.request_type,
    tmdb_id: row.tmdb_id,
    title: row.title,
    status: row.status,
    created_at: row.created_at,
    requested_by: row.requested_by,
    username: row.requested_by_username ?? "",
    items: Array.isArray(row.items)
      ? row.items.map((item: any) => ({
        id: Number(item.id),
        provider: item.provider,
        provider_id: item.provider_id !== null ? Number(item.provider_id) : null,
        season: item.season !== null ? Number(item.season) : null,
        episode: item.episode !== null ? Number(item.episode) : null,
        status: item.status
      }))
      : []
  }));
}

export async function getRequestWithItems(requestId: string) {
  const r = await getRequestById(requestId);
  if (!r) return null;
  const items = await listRequestItems(requestId);
  return { request: r, items };
}

export async function markRequestStatus(requestId: string, status: string) {
  const p = getPool();
  await p.query(`UPDATE media_request SET status=$2 WHERE id=$1`, [requestId, status]);
}

export async function deleteRequestById(requestId: string) {
  const p = getPool();
  await p.query(`DELETE FROM media_request WHERE id=$1`, [requestId]);
}

export async function updateRequestMetadata(input: {
  requestId: string;
  posterPath?: string | null;
  backdropPath?: string | null;
  releaseYear?: number | null;
}) {
  if (!input.posterPath && !input.backdropPath && !Number.isFinite(input.releaseYear ?? NaN)) {
    return;
  }
  const p = getPool();
  await p.query(
    `
    UPDATE media_request
    SET
      poster_path = COALESCE(poster_path, $2),
      backdrop_path = COALESCE(backdrop_path, $3),
      release_year = COALESCE(release_year, $4)
    WHERE id = $1
    `,
    [
      input.requestId,
      input.posterPath ?? null,
      input.backdropPath ?? null,
      Number.isFinite(input.releaseYear ?? NaN) ? input.releaseYear : null
    ]
  );
}

export type DbUserWithHash = {
  id: number;
  username: string;
  groups: string[];
  password_hash: string | null;
  email: string | null;
  oidc_sub: string | null;
  jellyfin_user_id: string | null;
  jellyfin_username: string | null;
  jellyfin_device_id: string | null;
  jellyfin_auth_token: string | null;
  discord_user_id: string | null;
  avatar_url: string | null;
  avatar_version: number | null;
  created_at: string;
  last_seen_at: string;
  mfa_secret: string | null;
  discover_region: string | null;
  original_language: string | null;
  watchlist_sync_movies: boolean;
  watchlist_sync_tv: boolean;
  request_limit_movie: number | null;
  request_limit_movie_days: number | null;
  request_limit_series: number | null;
  request_limit_series_days: number | null;
  banned: boolean;
  weekly_digest_opt_in: boolean;
};

export type UserSessionRecord = {
  jti: string;
  user_id: number;
  expires_at: string;
  revoked_at: string | null;
};

export type UserSessionSummary = {
  id: string;
  jti: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
};

export async function listUserSessions(userId: number): Promise<UserSessionSummary[]> {
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, jti, expires_at as "expiresAt", revoked_at as "revokedAt", last_seen_at as "lastSeenAt",
           user_agent as "userAgent", device_label as "deviceLabel", ip_address as "ipAddress"
    FROM user_session
    WHERE user_id = $1
    ORDER BY last_seen_at DESC NULLS LAST, expires_at DESC
    `,
    [userId]
  );
  return res.rows;
}

export async function createUserSession(
  userId: number,
  jti: string,
  expiresAt: Date,
  meta?: { userAgent?: string | null; deviceLabel?: string | null; ipAddress?: string | null }
): Promise<void> {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO user_session (id, user_id, jti, expires_at, user_agent, device_label, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (jti) DO NOTHING
    `,
    [
      randomUUID(),
      userId,
      jti,
      expiresAt.toISOString(),
      meta?.userAgent ?? null,
      meta?.deviceLabel ?? null,
      meta?.ipAddress ?? null
    ]
  );
}

export async function touchUserSession(jti: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `
    UPDATE user_session
    SET last_seen_at = NOW()
    WHERE jti = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
    RETURNING jti
    `,
    [jti]
  );
  return Number(res.rowCount ?? 0) > 0;
}

export async function revokeSessionByJti(jti: string): Promise<void> {
  const p = getPool();
  await p.query(`UPDATE user_session SET revoked_at = NOW() WHERE jti = $1`, [jti]);
}

export async function revokeSessionByJtiForUser(userId: number, jti: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE user_session
     SET revoked_at = NOW()
     WHERE user_id = $1 AND jti = $2`,
    [userId, jti]
  );
  return Number(res.rowCount ?? 0) > 0;
}

export async function revokeOtherSessionsForUser(userId: number, currentJti: string): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `UPDATE user_session
     SET revoked_at = NOW()
     WHERE user_id = $1 AND jti <> $2`,
    [userId, currentJti]
  );
  return Number(res.rowCount ?? 0);
}

export type AdminSessionSummary = {
  userId: number;
  username: string;
  jti: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
};

export async function listAllUserSessions(limit = 500): Promise<AdminSessionSummary[]> {
  const p = getPool();
  const res = await p.query(
    `
    SELECT us.user_id as "userId",
           u.username as "username",
           us.jti as "jti",
           us.expires_at as "expiresAt",
           us.revoked_at as "revokedAt",
           us.last_seen_at as "lastSeenAt",
           us.user_agent as "userAgent",
           us.device_label as "deviceLabel",
           us.ip_address as "ipAddress"
    FROM user_session us
    JOIN app_user u ON us.user_id = u.id
    ORDER BY us.last_seen_at DESC NULLS LAST, us.expires_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return res.rows;
}

export async function deleteUserSessionByJtiForUser(userId: number, jti: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `DELETE FROM user_session WHERE user_id = $1 AND jti = $2`,
    [userId, jti]
  );
  return Number(res.rowCount ?? 0) > 0;
}

export async function deleteUserSessionByJti(jti: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(`DELETE FROM user_session WHERE jti = $1`, [jti]);
  return Number(res.rowCount ?? 0) > 0;
}

export async function revokeAllSessionsForUser(userId: number): Promise<void> {
  const p = getPool();
  await p.query(`UPDATE user_session SET revoked_at = NOW() WHERE user_id = $1`, [userId]);
}

export async function purgeExpiredSessions(): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `
    DELETE FROM user_session
    WHERE revoked_at IS NOT NULL
       OR expires_at <= NOW()
    `
  );
  return Number(res.rowCount ?? 0);
}

export async function isSessionActive(jti: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `SELECT 1 FROM user_session WHERE jti = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [jti]
  );
  return Number(res.rowCount ?? 0) > 0;
}

export async function getUserWithHash(username: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
  SELECT id, username, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, discord_user_id, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
  FROM app_user
  WHERE username = $1
  LIMIT 1
  `,
    [username]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: row.jellyfin_auth_token ?? null,
    discord_user_id: row.discord_user_id ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: row.mfa_secret ?? null,
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in,
  };
}

export async function getUserById(id: number) {
  await ensureUserSchema();
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT
      u.id,
      u.username,
      u.email,
      u.discord_user_id,
      u.groups,
      u.created_at,
      u.last_seen_at,
      u.mfa_secret,
      u.discover_region,
      u.original_language,
      u.watchlist_sync_movies,
      u.watchlist_sync_tv,
      u.request_limit_movie,
      u.request_limit_movie_days,
      u.request_limit_series,
      u.request_limit_series_days,
      u.banned,
      u.weekly_digest_opt_in,
      COALESCE(array_remove(array_agg(une.endpoint_id ORDER BY une.endpoint_id), NULL), '{}') AS notification_endpoint_ids
    FROM app_user u
    LEFT JOIN user_notification_endpoint une ON une.user_id = u.id
    WHERE u.id = $1
    GROUP BY u.id
    LIMIT 1
    `,
    [id]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    email: row.email,
    discordUserId: row.discord_user_id ?? null,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_enabled: !!row.mfa_secret,
    discoverRegion: row.discover_region ?? null,
    originalLanguage: row.original_language ?? null,
    watchlistSyncMovies: !!row.watchlist_sync_movies,
    watchlistSyncTv: !!row.watchlist_sync_tv,
    requestLimitMovie: row.request_limit_movie ?? null,
    requestLimitMovieDays: row.request_limit_movie_days ?? null,
    requestLimitSeries: row.request_limit_series ?? null,
    requestLimitSeriesDays: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weeklyDigestOptIn: !!row.weekly_digest_opt_in,
    notificationEndpointIds: Array.isArray(row.notification_endpoint_ids)
      ? row.notification_endpoint_ids.map((endpointId: any) => Number(endpointId)).filter((n: number) => Number.isFinite(n))
      : []
  };
}

export async function setUserPassword(username: string, groups: string[], passwordHash: string, email?: string | null): Promise<DbUserWithHash> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO app_user (username, groups, password_hash, email, last_seen_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (username)
    DO UPDATE SET groups = EXCLUDED.groups, password_hash = EXCLUDED.password_hash, email = COALESCE(EXCLUDED.email, app_user.email), last_seen_at = NOW()
    RETURNING id, username, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, discord_user_id, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    `,
    [username, groups.join(","), passwordHash, email ?? null]
  );
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: row.jellyfin_auth_token ?? null,
    discord_user_id: row.discord_user_id ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: row.mfa_secret ?? null,
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in,
  };
}

export async function updateUserPasswordById(id: number, passwordHash: string) {
  const p = getPool();
  await p.query(
    `
    UPDATE app_user
    SET password_hash = $1, last_seen_at = NOW()
    WHERE id = $2
    `,
    [passwordHash, id]
  );
}

export async function deleteUserById(id: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`DELETE FROM app_user WHERE id = $1`, [id]);
}

export type DbUser = {
  id: number;
  username: string;
  jellyfinUserId?: string | null;
  jellyfinUsername?: string | null;
  discordUserId?: string | null;
  email: string | null;
  groups: string[];
  avatarUrl?: string | null;
  avatarVersion?: number | null;
  created_at: string;
  last_seen_at: string;
  mfa_enabled: boolean;
  notificationEndpointIds: number[];
  discoverRegion?: string | null;
  originalLanguage?: string | null;
  watchlistSyncMovies: boolean;
  watchlistSyncTv: boolean;
  requestLimitMovie: number | null;
  requestLimitMovieDays: number | null;
  requestLimitSeries: number | null;
  requestLimitSeriesDays: number | null;
  banned: boolean;
  weeklyDigestOptIn: boolean;
};

export async function listUsers(): Promise<DbUser[]> {
  await ensureUserSchema();
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
  SELECT
    u.id,
    u.username,
    u.jellyfin_user_id,
    u.jellyfin_username,
    u.discord_user_id,
    u.avatar_url,
    u.avatar_version,
    u.email,
    u.groups,
    u.mfa_secret,
    u.created_at,
    u.last_seen_at,
    u.discover_region,
    u.original_language,
    u.watchlist_sync_movies,
    u.watchlist_sync_tv,
    u.request_limit_movie,
    u.request_limit_movie_days,
    u.request_limit_series,
    u.request_limit_series_days,
    u.banned,
    u.weekly_digest_opt_in,
      COALESCE(array_remove(array_agg(une.endpoint_id ORDER BY une.endpoint_id), NULL), '{}') AS notification_endpoint_ids
    FROM app_user u
    LEFT JOIN user_notification_endpoint une ON une.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
    `
  );
  return res.rows.map(row => ({
    id: row.id,
    username: row.username,
    jellyfinUserId: row.jellyfin_user_id ?? null,
    jellyfinUsername: row.jellyfin_username ?? null,
    discordUserId: row.discord_user_id ?? null,
    avatarUrl: row.avatar_url ?? null,
    avatarVersion: row.avatar_version ?? null,
    email: row.email,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_enabled: !!row.mfa_secret,
    discoverRegion: row.discover_region ?? null,
    originalLanguage: row.original_language ?? null,
    watchlistSyncMovies: !!row.watchlist_sync_movies,
    watchlistSyncTv: !!row.watchlist_sync_tv,
    requestLimitMovie: row.request_limit_movie ?? null,
    requestLimitMovieDays: row.request_limit_movie_days ?? null,
    requestLimitSeries: row.request_limit_series ?? null,
    requestLimitSeriesDays: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weeklyDigestOptIn: !!row.weekly_digest_opt_in,
    notificationEndpointIds: Array.isArray(row.notification_endpoint_ids)
      ? row.notification_endpoint_ids.map((id: any) => Number(id)).filter((n: number) => Number.isFinite(n))
      : []
  }));
}

export async function updateUserProfile(id: number, input: { username?: string; email?: string | null; groups?: string[]; discordUserId?: string | null; discoverRegion?: string | null; originalLanguage?: string | null; watchlistSyncMovies?: boolean; watchlistSyncTv?: boolean }) {
  await ensureUserSchema();
  const p = getPool();
  const clauses: string[] = [];
  const values: any[] = [];
  let idx = 1;

  if (input.username) {
    clauses.push(`username = $${idx++}`);
    values.push(input.username);
  }
  if (input.email !== undefined) {
    clauses.push(`email = $${idx++}`);
    values.push(input.email);
  }
  if (input.groups) {
    clauses.push(`groups = $${idx++}`);
    values.push(input.groups.join(","));
  }
  if (input.discordUserId !== undefined) {
    clauses.push(`discord_user_id = $${idx++}`);
    values.push(input.discordUserId);
  }
  if (input.discoverRegion !== undefined) {
    clauses.push(`discover_region = $${idx++}`);
    values.push(input.discoverRegion);
  }
  if (input.originalLanguage !== undefined) {
    clauses.push(`original_language = $${idx++}`);
    values.push(input.originalLanguage);
  }
  if (input.watchlistSyncMovies !== undefined) {
    clauses.push(`watchlist_sync_movies = $${idx++}`);
    values.push(input.watchlistSyncMovies);
  }
  if (input.watchlistSyncTv !== undefined) {
    clauses.push(`watchlist_sync_tv = $${idx++}`);
    values.push(input.watchlistSyncTv);
  }
  if (!clauses.length) return null;

  values.push(id);
  const res = await p.query(
    `
    UPDATE app_user
    SET ${clauses.join(", ")}, last_seen_at = NOW()
    WHERE id = $${idx}
    RETURNING id
    `,
    values
  );
  if (!res.rows.length) return null;
  const updated = await getUserById(res.rows[0].id);
  return updated;
}

export async function getUserByJellyfinUserId(jellyfinUserId: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, discord_user_id, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    FROM app_user
    WHERE jellyfin_user_id = $1
    LIMIT 1
    `,
    [jellyfinUserId]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: row.jellyfin_auth_token ?? null,
    discord_user_id: row.discord_user_id ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: row.mfa_secret ?? null,
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in,
  };
}

export async function getUserByEmailOrUsername(email: string | null, username: string | null): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, discord_user_id, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    FROM app_user
    WHERE (LOWER(email) = LOWER($1) AND $1 <> '') OR (LOWER(username) = LOWER($2) AND $2 <> '')
    LIMIT 1
    `,
    [email ?? "", username ?? ""]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: row.jellyfin_auth_token ?? null,
    discord_user_id: row.discord_user_id ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: row.mfa_secret ?? null,
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in,
  };
}

export async function linkUserToJellyfin(input: {
  userId: number;
  jellyfinUserId: string;
  jellyfinUsername: string;
  jellyfinDeviceId: string;
  jellyfinAuthToken?: string | null;
  avatarUrl?: string | null;
}) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `
    UPDATE app_user
    SET jellyfin_user_id = $1,
        jellyfin_username = $2,
        jellyfin_device_id = $3,
        jellyfin_auth_token = $4,
        avatar_url = $5,
        avatar_version = avatar_version + 1,
        last_seen_at = NOW()
    WHERE id = $6
    `,
    [
      input.jellyfinUserId,
      input.jellyfinUsername,
      input.jellyfinDeviceId,
      input.jellyfinAuthToken ?? null,
      input.avatarUrl ?? null,
      input.userId
    ]
  );
}

export async function unlinkUserFromJellyfin(userId: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `
    UPDATE app_user
    SET jellyfin_user_id = NULL,
        jellyfin_username = NULL,
        jellyfin_device_id = NULL,
        jellyfin_auth_token = NULL,
        avatar_url = NULL,
        avatar_version = avatar_version + 1,
        last_seen_at = NOW()
    WHERE id = $1
    `,
    [userId]
  );
}

export async function createJellyfinUser(input: {
  username: string;
  email?: string | null;
  groups: string[];
  jellyfinUserId: string;
  jellyfinUsername: string;
  jellyfinDeviceId: string;
  avatarUrl?: string | null;
}): Promise<DbUserWithHash> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO app_user (username, groups, email, jellyfin_user_id, jellyfin_username, jellyfin_device_id, avatar_url, last_seen_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    RETURNING id, username, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, discord_user_id, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    `,
    [
      input.username,
      input.groups.join(","),
      input.email ?? null,
      input.jellyfinUserId,
      input.jellyfinUsername,
      input.jellyfinDeviceId,
      input.avatarUrl ?? null
    ]
  );
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: row.jellyfin_auth_token ?? null,
    discord_user_id: row.discord_user_id ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: row.mfa_secret ?? null,
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in,
  };
}

export type MfaSessionType = "verify" | "setup";

export type MfaSessionRecord = {
  id: string;
  user_id: number;
  type: MfaSessionType;
  secret: string | null;
  expires_at: string;
};

let ensureUserSchemaPromise: Promise<void> | null = null;
async function ensureUserSchema() {
  if (ensureUserSchemaPromise) return ensureUserSchemaPromise;
  ensureUserSchemaPromise = (async () => {
    const p = getPool();
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS mfa_secret TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS oidc_sub TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS jellyfin_user_id TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS jellyfin_username TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS jellyfin_device_id TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS jellyfin_auth_token TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS discord_user_id TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_version INTEGER NOT NULL DEFAULT 0;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_movie INTEGER;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_movie_days INTEGER;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_series INTEGER;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_series_days INTEGER;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS discover_region TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS original_language TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS watchlist_sync_movies BOOLEAN DEFAULT FALSE;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS watchlist_sync_tv BOOLEAN DEFAULT FALSE;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS weekly_digest_opt_in BOOLEAN DEFAULT FALSE;`);
    await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_oidc_sub ON app_user(oidc_sub);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_app_user_jellyfin_user_id ON app_user(jellyfin_user_id);`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS mfa_session (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('verify','setup')),
        secret TEXT,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_mfa_session_user_id ON mfa_session(user_id);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_mfa_session_expires_at ON mfa_session(expires_at);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_credential (
        id TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name TEXT,
        public_key BYTEA NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        device_type TEXT NOT NULL,
        backed_up BOOLEAN NOT NULL,
        transports TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`ALTER TABLE user_credential ADD COLUMN IF NOT EXISTS name TEXT;`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_credential_user_id ON user_credential(user_id);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS webauthn_challenge (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id BIGINT REFERENCES app_user(id) ON DELETE CASCADE,
        challenge TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_webauthn_challenge_expires_at ON webauthn_challenge(expires_at);`);

    await p.query(`ALTER TABLE user_session ADD COLUMN IF NOT EXISTS user_agent TEXT;`);
    await p.query(`ALTER TABLE user_session ADD COLUMN IF NOT EXISTS device_label TEXT;`);
    await p.query(`ALTER TABLE user_session ADD COLUMN IF NOT EXISTS ip_address TEXT;`);
  })();
  return ensureUserSchemaPromise;
}

export async function createWebAuthnChallenge(userId: number | null, challenge: string, expiresInSeconds = 300): Promise<string> {
  await ensureUserSchema();
  const p = getPool();
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const res = await p.query(
    `INSERT INTO webauthn_challenge (user_id, challenge, expires_at) VALUES ($1, $2, $3) RETURNING id`,
    [userId, challenge, expiresAt]
  );
  return res.rows[0].id;
}

export async function getWebAuthnChallenge(id: string): Promise<{ challenge: string; user_id: number | null } | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT challenge, user_id FROM webauthn_challenge WHERE id = $1 AND expires_at > NOW()`,
    [id]
  );
  if (!res.rows.length) return null;
  return { challenge: res.rows[0].challenge, user_id: res.rows[0].user_id ? Number(res.rows[0].user_id) : null };
}

export async function deleteWebAuthnChallenge(id: string) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`DELETE FROM webauthn_challenge WHERE id = $1`, [id]);
}

export async function addUserCredential(input: {
  id: string;
  userId: number;
  publicKey: Buffer;
  counter: number;
  deviceType: string;
  backedUp: boolean;
  transports?: string[];
}) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `INSERT INTO user_credential (id, user_id, public_key, counter, device_type, backed_up, transports)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [input.id, input.userId, input.publicKey, input.counter, input.deviceType, input.backedUp, input.transports?.join(",")]
  );
}

export async function listUserCredentials(userId: number) {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT id, name, public_key, counter, device_type, backed_up, transports, created_at FROM user_credential WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows.map(r => ({
    id: r.id,
    name: r.name ?? null,
    publicKey: r.public_key,
    counter: Number(r.counter),
    deviceType: r.device_type,
    backedUp: !!r.backed_up,
    transports: r.transports ? r.transports.split(",") : [],
    created_at: r.created_at
  }));
}

export async function getCredentialById(id: string) {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id, name, public_key, counter, device_type, backed_up, transports, created_at FROM user_credential WHERE id = $1`,
    [id]
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    userId: Number(r.user_id),
    name: r.name ?? null,
    publicKey: r.public_key,
    counter: Number(r.counter),
    deviceType: r.device_type,
    backedUp: !!r.backed_up,
    transports: r.transports ? r.transports.split(",") : [],
    created_at: r.created_at
  };
}

export async function updateCredentialCounter(id: string, counter: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`UPDATE user_credential SET counter = $1 WHERE id = $2`, [counter, id]);
}

export async function updateUserCredentialName(id: string, userId: number, name: string) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`UPDATE user_credential SET name = $1 WHERE id = $2 AND user_id = $3`, [name, id, userId]);
}

export async function deleteUserCredential(id: string, userId: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`DELETE FROM user_credential WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function deleteAllUserCredentials(userId: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`DELETE FROM user_credential WHERE user_id = $1`, [userId]);
}

export async function unlinkUserOidc(userId: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`UPDATE app_user SET oidc_sub = NULL, last_seen_at = NOW() WHERE id = $1`, [userId]);
}

let ensureMediaListSchemaPromise: Promise<void> | null = null;
async function ensureMediaListSchema() {
  if (ensureMediaListSchemaPromise) return ensureMediaListSchemaPromise;
  ensureMediaListSchemaPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS user_media_list (
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        list_type TEXT NOT NULL CHECK (list_type IN ('favorite','watchlist')),
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        tmdb_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, list_type, media_type, tmdb_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_media_list_user ON user_media_list(user_id, list_type, created_at DESC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_media_list_tmdb ON user_media_list(media_type, tmdb_id);`);
  })();
  return ensureMediaListSchemaPromise;
}

export async function getUserByOidcSub(oidcSub: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, discord_user_id, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    FROM app_user
    WHERE oidc_sub = $1
    LIMIT 1
    `,
    [oidcSub]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: row.jellyfin_auth_token ?? null,
    discord_user_id: row.discord_user_id ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: row.mfa_secret ?? null,
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in,
  };
}

export async function getUserByEmail(email: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, discord_user_id, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    FROM app_user
    WHERE LOWER(email) = LOWER($1)
    LIMIT 1
    `,
    [email]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: row.jellyfin_auth_token ?? null,
    discord_user_id: row.discord_user_id ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: row.mfa_secret ?? null,
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in,
  };
}

export async function getUserByUsername(username: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, discord_user_id, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    FROM app_user
    WHERE username = $1
    LIMIT 1
    `,
    [username]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: row.jellyfin_auth_token ?? null,
    discord_user_id: row.discord_user_id ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: row.mfa_secret ?? null,
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in,
  };
}

export type UserMediaListType = "favorite" | "watchlist";

export type UserMediaListItem = {
  user_id: number;
  list_type: UserMediaListType;
  media_type: "movie" | "tv";
  tmdb_id: number;
  created_at: string;
};

export async function addUserMediaListItem(input: {
  userId: number;
  listType: UserMediaListType;
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO user_media_list (user_id, list_type, media_type, tmdb_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT DO NOTHING
    `,
    [input.userId, input.listType, input.mediaType, input.tmdbId]
  );
}

export async function removeUserMediaListItem(input: {
  userId: number;
  listType: UserMediaListType;
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  await p.query(
    `
    DELETE FROM user_media_list
    WHERE user_id = $1 AND list_type = $2 AND media_type = $3 AND tmdb_id = $4
    `,
    [input.userId, input.listType, input.mediaType, input.tmdbId]
  );
}

export async function listUserMediaList(input: {
  userId: number;
  listType: UserMediaListType;
  limit?: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const res = await p.query(
    `
    SELECT user_id, list_type, media_type, tmdb_id, created_at
    FROM user_media_list
    WHERE user_id = $1 AND list_type = $2
    ORDER BY created_at DESC
    LIMIT $3
    `,
    [input.userId, input.listType, limit]
  );
  return res.rows as UserMediaListItem[];
}

export async function getUserMediaListStatus(input: {
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT list_type
    FROM user_media_list
    WHERE user_id = $1 AND media_type = $2 AND tmdb_id = $3
    `,
    [input.userId, input.mediaType, input.tmdbId]
  );
  const types = new Set(res.rows.map(row => row.list_type as UserMediaListType));
  return {
    favorite: types.has("favorite"),
    watchlist: types.has("watchlist")
  };
}

export async function listUsersWithWatchlistSync() {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, jellyfin_user_id, watchlist_sync_movies, watchlist_sync_tv, groups
    FROM app_user
    WHERE jellyfin_user_id IS NOT NULL
      AND (watchlist_sync_movies = TRUE OR watchlist_sync_tv = TRUE)
    `
  );
  return res.rows.map(row => ({
    id: Number(row.id),
    username: row.username as string,
    jellyfinUserId: row.jellyfin_user_id as string,
    syncMovies: !!row.watchlist_sync_movies,
    syncTv: !!row.watchlist_sync_tv,
    isAdmin: (row.groups as string)?.includes("admin") || (row.groups as string)?.includes("owner")
  }));
}

export async function createOidcUser(input: {
  username: string;
  email?: string | null;
  groups: string[];
  oidcSub: string;
}): Promise<DbUserWithHash> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO app_user (username, groups, email, oidc_sub, last_seen_at)
    VALUES ($1, $2, $3, $4, NOW())
    RETURNING id, username, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, discord_user_id, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    `,
    [input.username, input.groups.join(","), input.email ?? null, input.oidcSub]
  );
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    groups: (row.groups as string)?.split(",").filter(Boolean) ?? [],
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: row.jellyfin_auth_token ?? null,
    discord_user_id: row.discord_user_id ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: row.mfa_secret ?? null,
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in,
  };
}

export async function updateUserOidcLink(input: { userId: number; oidcSub: string; email?: string | null; groups?: string[] }) {
  await ensureUserSchema();
  const p = getPool();
  const clauses: string[] = [];
  const values: any[] = [];
  let idx = 1;

  clauses.push(`oidc_sub = $${idx++}`);
  values.push(input.oidcSub);

  if (input.email !== undefined) {
    clauses.push(`email = $${idx++}`);
    values.push(input.email);
  }
  if (input.groups) {
    clauses.push(`groups = $${idx++}`);
    values.push(input.groups.join(","));
  }

  values.push(input.userId);

  await p.query(
    `
    UPDATE app_user
    SET ${clauses.join(", ")}, last_seen_at = NOW()
    WHERE id = $${idx}
    `,
    values
  );
}

export async function createMfaSession(input: {
  userId: number;
  type: MfaSessionType;
  expiresInSeconds: number;
  secret?: string | null;
}): Promise<MfaSessionRecord> {
  await ensureUserSchema();
  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO mfa_session (user_id, type, secret, expires_at)
    VALUES ($1, $2, $3, $4)
    RETURNING id, user_id, type, secret, expires_at
    `,
    [input.userId, input.type, input.secret ?? null, expiresAt]
  );
  const row = res.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    secret: row.secret,
    expires_at: row.expires_at
  };
}

export async function getMfaSessionById(id: string): Promise<MfaSessionRecord | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, user_id, type, secret, expires_at
    FROM mfa_session
    WHERE id = $1
      AND expires_at > NOW()
    LIMIT 1
    `,
    [id]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    user_id: row.user_id,
    type: row.type,
    secret: row.secret,
    expires_at: row.expires_at
  };
}

export async function deleteMfaSessionById(id: string) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`DELETE FROM mfa_session WHERE id = $1`, [id]);
}

export async function deleteMfaSessionsForUser(userId: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`DELETE FROM mfa_session WHERE user_id = $1`, [userId]);
}

export async function getUserMfaSecretById(userId: number): Promise<string | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(`SELECT mfa_secret FROM app_user WHERE id = $1 LIMIT 1`, [userId]);
  if (!res.rows.length) return null;
  return res.rows[0].mfa_secret ?? null;
}

export async function setUserMfaSecretById(userId: number, secret: string) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`UPDATE app_user SET mfa_secret = $1, last_seen_at = NOW() WHERE id = $2`, [secret, userId]);
}

export async function resetUserMfaById(userId: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`UPDATE app_user SET mfa_secret = NULL, last_seen_at = NOW() WHERE id = $1`, [userId]);
  await deleteMfaSessionsForUser(userId);
}

let ensureSchemaPromise: Promise<void> | null = null;
async function ensureSchema() {
  if (ensureSchemaPromise) return ensureSchemaPromise;
  ensureSchemaPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS notification_endpoint (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('telegram','discord','email','webhook')),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        is_global BOOLEAN NOT NULL DEFAULT FALSE,
        events JSONB NOT NULL DEFAULT '["request_pending","request_submitted","request_denied","request_failed","request_already_exists","request_available","request_removed","issue_reported","issue_resolved"]'::jsonb,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`ALTER TABLE notification_endpoint ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;`);
    await p.query(`ALTER TABLE notification_endpoint ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;`);
    await p.query(
      `ALTER TABLE notification_endpoint ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '["request_pending","request_submitted","request_denied","request_failed","request_already_exists","request_available","request_removed","issue_reported","issue_resolved"]'::jsonb;`
    );
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_endpoint_type ON notification_endpoint(type);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_endpoint_enabled ON notification_endpoint(enabled);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_endpoint_is_global ON notification_endpoint(is_global);`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS app_setting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`
      CREATE TABLE IF NOT EXISTS user_notification_endpoint (
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        endpoint_id BIGINT NOT NULL REFERENCES notification_endpoint(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, endpoint_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_notification_endpoint_user_id ON user_notification_endpoint(user_id);`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS media_issue (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        tmdb_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        reporter_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_issue_created_at ON media_issue(created_at DESC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_issue_tmdb ON media_issue(media_type, tmdb_id);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_dashboard_slider (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        type INTEGER NOT NULL,
        title TEXT,
        data TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        order_index INTEGER NOT NULL DEFAULT 0,
        is_builtin BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_dashboard_slider_user_order ON user_dashboard_slider(user_id, order_index ASC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_dashboard_slider_user_enabled ON user_dashboard_slider(user_id, enabled);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS recently_viewed (
        user_id INTEGER NOT NULL,
        media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('movie', 'tv')),
        tmdb_id INTEGER NOT NULL,
        title VARCHAR(500) NOT NULL,
        poster_path VARCHAR(500),
        last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, media_type, tmdb_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_time ON recently_viewed(user_id, last_viewed_at DESC);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS media_share (
        id SERIAL PRIMARY KEY,
        token VARCHAR(64) NOT NULL UNIQUE,
        media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('movie', 'tv')),
        tmdb_id INTEGER NOT NULL,
        created_by INTEGER NOT NULL,
        expires_at TIMESTAMPTZ,
        view_count INTEGER DEFAULT 0,
        max_views INTEGER,
        password_hash TEXT,
        last_viewed_at TIMESTAMPTZ,
        last_viewed_ip TEXT,
        last_viewed_referrer TEXT,
        last_viewed_country TEXT,
        last_viewed_ua_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_ip TEXT;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_referrer TEXT;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_country TEXT;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_ua_hash TEXT;`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_share_token ON media_share(token);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_share_created_by ON media_share(created_by);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_share_expires ON media_share(expires_at);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS upgrade_finder_hint (
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        media_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('available','none','error')),
        hint_text TEXT,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (media_type, media_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_upgrade_finder_hint_checked_at ON upgrade_finder_hint(checked_at DESC);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS upgrade_finder_override (
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        media_id INTEGER NOT NULL,
        ignore_4k BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (media_type, media_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_upgrade_finder_override_updated_at ON upgrade_finder_override(updated_at DESC);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        schedule VARCHAR(50) NOT NULL DEFAULT '0 * * * *',
        interval_seconds INTEGER DEFAULT 3600,
        type VARCHAR(50) NOT NULL DEFAULT 'system',
        enabled BOOLEAN DEFAULT TRUE,
        last_run TIMESTAMPTZ,
        next_run TIMESTAMPTZ,
        run_on_start BOOLEAN DEFAULT FALSE,
        failure_count INTEGER DEFAULT 0,
        last_error TEXT,
        disabled_reason TEXT
      );
    `);
    await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0;`);
    await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_error TEXT;`);
    await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS disabled_reason TEXT;`);
    await p.query(`
      INSERT INTO jobs (name, schedule, interval_seconds, type, run_on_start)
      VALUES
          ('request-sync', '*/5 * * * *', 300, 'system', TRUE),
          ('watchlist-sync', '0 * * * *', 3600, 'system', FALSE),
          ('weekly-digest', '0 9 * * 1', 604800, 'system', FALSE),
          ('session-cleanup', '0 * * * *', 3600, 'system', TRUE),
          ('calendar-notifications', '0 */6 * * *', 21600, 'system', FALSE),
          ('jellyfin-availability-sync', '0 */4 * * *', 14400, 'system', FALSE),
          ('upgrade-finder-4k', '0 3 * * *', 86400, 'system', FALSE)
      ON CONFLICT (name) DO NOTHING;
    `);
  })();
  return ensureSchemaPromise;
}

async function bootstrapDashboardSlidersForUser(userId: number) {
  const p = getPool();
  const countRes = await p.query(`SELECT COUNT(*)::int AS count FROM user_dashboard_slider WHERE user_id = $1`, [userId]);
  const count = Number(countRes.rows[0]?.count ?? 0);
  if (count > 0) return;

  await p.query("BEGIN");
  try {
    const countRes2 = await p.query(`SELECT COUNT(*)::int AS count FROM user_dashboard_slider WHERE user_id = $1`, [userId]);
    const count2 = Number(countRes2.rows[0]?.count ?? 0);
    if (count2 === 0) {
      for (const s of defaultDashboardSliders) {
        await p.query(
          `
          INSERT INTO user_dashboard_slider (user_id, type, title, data, enabled, order_index, is_builtin)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          `,
          [userId, Number(s.type), s.title ?? null, s.data ?? null, !!s.enabled, s.order, !!s.isBuiltIn]
        );
      }
    }
    await p.query("COMMIT");
  } catch (e) {
    await p.query("ROLLBACK");
    throw e;
  }
}

interface DashboardSliderRow {
  id: number | string;
  type: number | string;
  title: string | null;
  data: string | null;
  enabled: boolean;
  order_index: number | string;
  is_builtin: boolean;
}

function mapDashboardSliderRow(r: DashboardSliderRow): DashboardSlider {
  return {
    id: Number(r.id),
    type: Number(r.type),
    title: r.title ?? null,
    data: r.data ?? null,
    enabled: !!r.enabled,
    order: Number(r.order_index ?? 0),
    isBuiltIn: !!r.is_builtin,
  };
}

export async function listDashboardSlidersForUser(userId: number): Promise<DashboardSlider[]> {
  await ensureSchema();
  await bootstrapDashboardSlidersForUser(userId);
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, type, title, data, enabled, order_index, is_builtin
    FROM user_dashboard_slider
    WHERE user_id = $1
    ORDER BY order_index ASC, id ASC
    `,
    [userId]
  );
  return res.rows.map(mapDashboardSliderRow);
}

export async function resetDashboardSlidersForUser(userId: number): Promise<void> {
  await ensureSchema();
  const p = getPool();
  await p.query("BEGIN");
  try {
    await p.query(`DELETE FROM user_dashboard_slider WHERE user_id = $1`, [userId]);
    for (const s of defaultDashboardSliders) {
      await p.query(
        `
        INSERT INTO user_dashboard_slider (user_id, type, title, data, enabled, order_index, is_builtin)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [userId, Number(s.type), s.title ?? null, s.data ?? null, !!s.enabled, s.order, !!s.isBuiltIn]
      );
    }
    await p.query("COMMIT");
  } catch (e) {
    await p.query("ROLLBACK");
    throw e;
  }
}

export async function updateDashboardSlidersForUser(userId: number, sliders: DashboardSlider[]): Promise<void> {
  await ensureSchema();
  const p = getPool();
  const existingRes = await p.query(
    `SELECT id, is_builtin FROM user_dashboard_slider WHERE user_id = $1`,
    [userId]
  );
  const existing = new Map<number, { isBuiltIn: boolean }>();
  for (const r of existingRes.rows) {
    existing.set(Number(r.id), { isBuiltIn: !!r.is_builtin });
  }

  await p.query("BEGIN");
  try {
    for (let index = 0; index < sliders.length; index++) {
      const s = sliders[index];
      const sliderId = Number(s.id);
      if (Number.isFinite(sliderId) && existing.has(sliderId)) {
        const isBuiltIn = existing.get(sliderId)!.isBuiltIn;
        if (isBuiltIn) {
          await p.query(
            `
            UPDATE user_dashboard_slider
            SET enabled = $3, order_index = $4, updated_at = NOW()
            WHERE user_id = $1 AND id = $2
            `,
            [userId, sliderId, !!s.enabled, index]
          );
        } else {
          await p.query(
            `
            UPDATE user_dashboard_slider
            SET enabled = $3, order_index = $4, type = $5, title = $6, data = $7, updated_at = NOW()
            WHERE user_id = $1 AND id = $2
            `,
            [userId, sliderId, !!s.enabled, index, Number(s.type), s.title ?? null, s.data ?? null]
          );
        }
      } else {
        await p.query(
          `
          INSERT INTO user_dashboard_slider (user_id, type, title, data, enabled, order_index, is_builtin)
          VALUES ($1, $2, $3, $4, $5, $6, false)
          `,
          [userId, Number(s.type), s.title ?? null, s.data ?? null, !!s.enabled, index]
        );
      }
    }
    await p.query("COMMIT");
  } catch (e) {
    await p.query("ROLLBACK");
    throw e;
  }
}

export async function createDashboardSliderForUser(userId: number, input: { type: number; title: string; data: string }): Promise<DashboardSlider> {
  await ensureSchema();
  const p = getPool();
  const orderRes = await p.query(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM user_dashboard_slider WHERE user_id = $1`, [userId]);
  const nextOrder = Number(orderRes.rows[0]?.next_order ?? 0);
  const res = await p.query(
    `
    INSERT INTO user_dashboard_slider (user_id, type, title, data, enabled, order_index, is_builtin)
    VALUES ($1, $2, $3, $4, false, $5, false)
    RETURNING id, type, title, data, enabled, order_index, is_builtin
    `,
    [userId, Number(input.type), input.title, input.data, nextOrder]
  );
  return mapDashboardSliderRow(res.rows[0]);
}

export async function updateCustomDashboardSliderForUser(userId: number, sliderId: number, input: { type: number; title: string; data: string }): Promise<DashboardSlider | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    UPDATE user_dashboard_slider
    SET type = $3, title = $4, data = $5, updated_at = NOW()
    WHERE user_id = $1 AND id = $2 AND is_builtin = false
    RETURNING id, type, title, data, enabled, order_index, is_builtin
    `,
    [userId, sliderId, Number(input.type), input.title, input.data]
  );
  if (!res.rows.length) return null;
  return mapDashboardSliderRow(res.rows[0]);
}

export async function deleteCustomDashboardSliderForUser(userId: number, sliderId: number): Promise<boolean> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `DELETE FROM user_dashboard_slider WHERE user_id = $1 AND id = $2 AND is_builtin = false`,
    [userId, sliderId]
  );
  return (res.rowCount ?? 0) > 0;
}

export type MediaIssue = {
  id: string;
  media_type: "movie" | "tv";
  tmdb_id: number;
  title: string;
  category: string;
  description: string;
  reporter_id: number;
  status: string;
  created_at: string;
  reporter_username?: string | null;
};

export async function createMediaIssue(input: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  category: string;
  description: string;
  reporterId: number;
}): Promise<MediaIssue> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO media_issue (media_type, tmdb_id, title, category, description, reporter_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id, media_type, tmdb_id, title, category, description, reporter_id, status, created_at
    `,
    [input.mediaType, input.tmdbId, input.title, input.category, input.description, input.reporterId]
  );
  return res.rows[0];
}

export async function countMediaIssuesByTmdb(mediaType: "movie" | "tv", tmdbId: number): Promise<number> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT COUNT(*)::int AS count
    FROM media_issue
    WHERE media_type = $1 AND tmdb_id = $2
    `,
    [mediaType, tmdbId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function listMediaIssues(limit = 200): Promise<MediaIssue[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT mi.id, mi.media_type, mi.tmdb_id, mi.title, mi.category, mi.description, mi.reporter_id, mi.status, mi.created_at,
           u.username AS reporter_username
    FROM media_issue mi
    JOIN app_user u ON u.id = mi.reporter_id
    ORDER BY mi.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  return res.rows.map((row: { id: string; media_type: "movie" | "tv"; tmdb_id: number; title: string; category: string; description: string; reporter_id: number; status: string; created_at: string; reporter_username: string | null }) => ({
    id: row.id,
    media_type: row.media_type,
    tmdb_id: row.tmdb_id,
    title: row.title,
    category: row.category,
    description: row.description,
    reporter_id: row.reporter_id,
    status: row.status,
    created_at: row.created_at,
    reporter_username: row.reporter_username ?? null
  }));
}

export async function getMediaIssueCounts(): Promise<{
  total: number;
  open: number;
  closed: number;
  video: number;
  audio: number;
  subtitles: number;
  others: number;
}> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(CASE WHEN status = 'open' THEN 1 END)::int AS open,
      COUNT(CASE WHEN status = 'resolved' THEN 1 END)::int AS closed,
      COUNT(CASE WHEN LOWER(category) = 'video' THEN 1 END)::int AS video,
      COUNT(CASE WHEN LOWER(category) = 'audio' THEN 1 END)::int AS audio,
      COUNT(CASE WHEN LOWER(category) IN ('subtitle', 'subtitles') THEN 1 END)::int AS subtitles,
      COUNT(CASE WHEN LOWER(category) = 'other' THEN 1 END)::int AS others
    FROM media_issue
    `
  );
  if (!res.rows.length) {
    return { total: 0, open: 0, closed: 0, video: 0, audio: 0, subtitles: 0, others: 0 };
  }
  const row = res.rows[0];
  return {
    total: Number(row.total ?? 0),
    open: Number(row.open ?? 0),
    closed: Number(row.closed ?? 0),
    video: Number(row.video ?? 0),
    audio: Number(row.audio ?? 0),
    subtitles: Number(row.subtitles ?? 0),
    others: Number(row.others ?? 0),
  };
}

export async function getMediaIssueById(id: string): Promise<MediaIssue | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT mi.id, mi.media_type, mi.tmdb_id, mi.title, mi.category, mi.description, mi.reporter_id, mi.status, mi.created_at,
           u.username AS reporter_username
    FROM media_issue mi
    JOIN app_user u ON u.id = mi.reporter_id
    WHERE mi.id = $1
    LIMIT 1
    `,
    [id]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: row.id,
    media_type: row.media_type,
    tmdb_id: row.tmdb_id,
    title: row.title,
    category: row.category,
    description: row.description,
    reporter_id: row.reporter_id,
    status: row.status,
    created_at: row.created_at,
    reporter_username: row.reporter_username ?? null
  };
}

export async function updateMediaIssueStatus(id: string, status: string): Promise<MediaIssue | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    UPDATE media_issue
    SET status = $2
    WHERE id = $1
    RETURNING id
    `,
    [id, status]
  );
  if (!res.rows.length) return null;
  return getMediaIssueById(res.rows[0].id);
}

export async function deleteMediaIssueById(id: string): Promise<boolean> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(`DELETE FROM media_issue WHERE id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function clearRequestsForTmdb(mediaType: "movie" | "tv", tmdbId: number) {
  await ensureSchema();
  const p = getPool();
  const requestType = mediaType === "movie" ? "movie" : "episode";
  const reqRes = await p.query(
    `
    DELETE FROM media_request
    WHERE request_type = $1 AND tmdb_id = $2
    RETURNING id
    `,
    [requestType, tmdbId]
  );
  const ids = reqRes.rows.map((row: any) => row.id);
  if (ids.length) {
    await p.query(`DELETE FROM request_item WHERE request_id = ANY($1)`, [ids]);
  }
}

export type NotificationEndpointType = "telegram" | "discord" | "email" | "webhook";

export type NotificationEndpointPublic = {
  id: number;
  name: string;
  type: NotificationEndpointType;
  enabled: boolean;
  is_global: boolean;
  events: string[];
  types: number;
  created_at: string;
};

// Proper types for notification endpoint configs
export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

export type DiscordConfig = {
  webhookUrl: string;
};

export type EmailConfig = {
  to: string;
};

export type WebhookConfig = {
  url: string;
};

export type NotificationEndpointConfig =
  | TelegramConfig
  | DiscordConfig
  | EmailConfig
  | WebhookConfig
  | Record<string, unknown>; // Fallback for unknown configs

export type NotificationEndpointFull = NotificationEndpointPublic & { config: NotificationEndpointConfig };

export async function listNotificationEndpoints(): Promise<NotificationEndpointPublic[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, events, types, created_at
    FROM notification_endpoint
    ORDER BY created_at DESC
    `
  );
  return res.rows.map(r => {
    const id = Number(r.id);
    return {
      id,
      name: r.name,
      type: r.type,
      enabled: !!r.enabled,
      is_global: !!r.is_global,
      events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
      types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
      config: r.config,
      created_at: r.created_at
    };
  });
}

export async function listNotificationEndpointsFull(): Promise<NotificationEndpointFull[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, events, types, config, created_at
    FROM notification_endpoint
    ORDER BY created_at DESC
    `
  );
  return res.rows.map(r => {
    const id = Number(r.id);
    return {
      id,
      name: r.name,
      type: r.type,
      enabled: !!r.enabled,
      is_global: !!r.is_global,
      events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
      types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
      config: r.config,
      created_at: r.created_at
    };
  });
}

const SETTINGS_CACHE_TTL_SECONDS = Math.max(
  5,
  Number(process.env.SETTINGS_CACHE_TTL_SECONDS ?? "30") || 30
);
const settingsCache = cacheManager.getCache("settings", {
  stdTTL: SETTINGS_CACHE_TTL_SECONDS,
  checkperiod: Math.max(10, Math.floor(SETTINGS_CACHE_TTL_SECONDS / 2))
});

function settingCacheKey(key: string) {
  return `setting:${key}`;
}

export async function getSetting(key: string): Promise<string | null> {
  await ensureSchema();
  const cacheKey = settingCacheKey(key);
  const cached = settingsCache.get<string | null>(cacheKey);
  if (cached !== undefined) {
    return cached;
  }
  const p = getPool();
  const res = await p.query(`SELECT value FROM app_setting WHERE key = $1 LIMIT 1`, [key]);
  const value = res.rows.length ? (res.rows[0].value as string) : null;
  settingsCache.set(cacheKey, value, SETTINGS_CACHE_TTL_SECONDS);
  return value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await ensureSchema();
  const p = getPool();
  await p.query(`INSERT INTO app_setting (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [key, value]);
  settingsCache.del(settingCacheKey(key));
}

export async function getSettingInt(key: string, fallback: number): Promise<number> {
  const raw = await getSetting(key);
  if (!raw) return fallback;
  const v = parseInt(raw, 10);
  if (!Number.isFinite(v) || isNaN(v)) return fallback;
  return v;
}

type RequestLimitSettings = {
  limit: number;
  days: number;
};

export type RequestLimitDefaults = {
  movie: RequestLimitSettings;
  series: RequestLimitSettings;
};

export type RequestLimitOverrides = {
  movieLimit: number | null;
  movieDays: number | null;
  seriesLimit: number | null;
  seriesDays: number | null;
};

export type RequestLimitStatus = {
  limit: number;
  days: number;
  used: number;
  remaining: number | null;
  unlimited: boolean;
};

const DEFAULT_REQUEST_LIMIT = 0;
const DEFAULT_REQUEST_DAYS = 7;

function normalizeLimitValue(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.floor(value));
}

function normalizeDaysValue(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export async function getDefaultRequestLimits(): Promise<RequestLimitDefaults> {
  const movieLimitRaw = await getSettingInt("request_limit_movie", DEFAULT_REQUEST_LIMIT);
  const movieDaysRaw = await getSettingInt("request_limit_movie_days", DEFAULT_REQUEST_DAYS);
  const seriesLimitRaw = await getSettingInt("request_limit_series", DEFAULT_REQUEST_LIMIT);
  const seriesDaysRaw = await getSettingInt("request_limit_series_days", DEFAULT_REQUEST_DAYS);

  return {
    movie: {
      limit: normalizeLimitValue(movieLimitRaw, DEFAULT_REQUEST_LIMIT),
      days: normalizeDaysValue(movieDaysRaw, DEFAULT_REQUEST_DAYS)
    },
    series: {
      limit: normalizeLimitValue(seriesLimitRaw, DEFAULT_REQUEST_LIMIT),
      days: normalizeDaysValue(seriesDaysRaw, DEFAULT_REQUEST_DAYS)
    }
  };
}

export async function getUserRequestLimitOverrides(userId: number): Promise<RequestLimitOverrides> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT
      request_limit_movie,
      request_limit_movie_days,
      request_limit_series,
      request_limit_series_days
    FROM app_user
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );
  if (!res.rows.length) {
    return { movieLimit: null, movieDays: null, seriesLimit: null, seriesDays: null };
  }
  const row = res.rows[0];
  return {
    movieLimit: row.request_limit_movie ?? null,
    movieDays: row.request_limit_movie_days ?? null,
    seriesLimit: row.request_limit_series ?? null,
    seriesDays: row.request_limit_series_days ?? null
  };
}

export async function getEffectiveRequestLimits(userId: number): Promise<RequestLimitDefaults> {
  const defaults = await getDefaultRequestLimits();
  const overrides = await getUserRequestLimitOverrides(userId);

  const movieLimit = overrides.movieLimit ?? defaults.movie.limit;
  const movieDays = overrides.movieDays ?? defaults.movie.days;
  const seriesLimit = overrides.seriesLimit ?? defaults.series.limit;
  const seriesDays = overrides.seriesDays ?? defaults.series.days;

  return {
    movie: {
      limit: normalizeLimitValue(movieLimit, defaults.movie.limit),
      days: normalizeDaysValue(movieDays, defaults.movie.days)
    },
    series: {
      limit: normalizeLimitValue(seriesLimit, defaults.series.limit),
      days: normalizeDaysValue(seriesDays, defaults.series.days)
    }
  };
}

export async function getUserRequestLimitStatus(
  userId: number,
  requestType: "movie" | "episode"
): Promise<RequestLimitStatus> {
  const limits = await getEffectiveRequestLimits(userId);
  const limitConfig = requestType === "movie" ? limits.movie : limits.series;
  const limit = limitConfig.limit;
  const days = limitConfig.days;

  if (limit <= 0) {
    return { limit: 0, days, used: 0, remaining: null, unlimited: true };
  }

  const p = getPool();
  const res = await p.query(
    `
    SELECT COUNT(*)::int AS count
    FROM media_request
    WHERE requested_by = $1
      AND request_type = $2
      AND created_at >= NOW() - ($3::int * INTERVAL '1 day')
    `,
    [userId, requestType, days]
  );
  const used = Number(res.rows[0]?.count ?? 0);
  const remaining = Math.max(limit - used, 0);
  return { limit, days, used, remaining, unlimited: false };
}

export type JellyfinConfig = {
  name: string;
  hostname: string;
  port: number;
  useSsl: boolean;
  urlBase: string;
  externalUrl: string;
  jellyfinForgotPasswordUrl: string;
  libraries: Array<{
    id: string;
    name: string;
    type: "movie" | "show";
    enabled: boolean;
    lastScan?: number;
  }>;
  serverId: string;
  apiKeyEncrypted: string;
};

const JellyfinConfigSchema = z.object({
  name: z.string().optional(),
  hostname: z.string().optional(),
  port: z.number().optional(),
  useSsl: z.boolean().optional(),
  urlBase: z.string().optional(),
  externalUrl: z.string().optional(),
  jellyfinForgotPasswordUrl: z.string().optional(),
  libraries: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        type: z.enum(["movie", "show"]),
        enabled: z.boolean(),
        lastScan: z.number().optional()
      })
    )
    .optional(),
  serverId: z.string().optional(),
  apiKeyEncrypted: z.string().optional(),
});

const JellyfinConfigDefaults: JellyfinConfig = {
  name: "",
  hostname: "",
  port: 8096,
  useSsl: false,
  urlBase: "",
  externalUrl: "",
  jellyfinForgotPasswordUrl: "",
  libraries: [],
  serverId: "",
  apiKeyEncrypted: "",
};

export async function getJellyfinConfig(): Promise<JellyfinConfig> {
  const raw = await getSetting("jellyfin_config");
  let parsed: Partial<JellyfinConfig> = {};
  if (raw) {
    try {
      parsed = JellyfinConfigSchema.parse(JSON.parse(raw));
    } catch {
      parsed = {};
    }
  }

  return {
    ...JellyfinConfigDefaults,
    ...parsed,
    name: parsed.name ?? JellyfinConfigDefaults.name,
    hostname: parsed.hostname ?? JellyfinConfigDefaults.hostname,
    port: typeof parsed.port === "number" ? parsed.port : JellyfinConfigDefaults.port,
    useSsl: parsed.useSsl ?? JellyfinConfigDefaults.useSsl,
    urlBase: parsed.urlBase ?? JellyfinConfigDefaults.urlBase,
    externalUrl: parsed.externalUrl ?? JellyfinConfigDefaults.externalUrl,
    jellyfinForgotPasswordUrl: parsed.jellyfinForgotPasswordUrl ?? JellyfinConfigDefaults.jellyfinForgotPasswordUrl,
    libraries: parsed.libraries ?? JellyfinConfigDefaults.libraries,
    serverId: parsed.serverId ?? JellyfinConfigDefaults.serverId,
    apiKeyEncrypted: parsed.apiKeyEncrypted ?? JellyfinConfigDefaults.apiKeyEncrypted,
  };
}

export async function setJellyfinConfig(input: JellyfinConfig): Promise<void> {
  await setSetting("jellyfin_config", JSON.stringify(input));
}

export type OidcConfig = {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  jwksUrl: string;
  logoutUrl: string;
  scopes: string[];
  usernameClaim: string;
  emailClaim: string;
  groupsClaim: string;
  allowAutoCreate: boolean;
  matchByEmail: boolean;
  matchByUsername: boolean;
  syncGroups: boolean;
};

const OidcConfigSchema = z.object({
  enabled: z.boolean().optional(),
  issuer: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().optional(),
  authorizationUrl: z.string().optional(),
  tokenUrl: z.string().optional(),
  userinfoUrl: z.string().optional(),
  jwksUrl: z.string().optional(),
  logoutUrl: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  usernameClaim: z.string().optional(),
  emailClaim: z.string().optional(),
  groupsClaim: z.string().optional(),
  allowAutoCreate: z.boolean().optional(),
  matchByEmail: z.boolean().optional(),
  matchByUsername: z.boolean().optional(),
  syncGroups: z.boolean().optional()
});

const OidcConfigDefaults: OidcConfig = {
  enabled: false,
  issuer: "",
  clientId: "",
  clientSecret: "",
  redirectUri: "",
  authorizationUrl: "",
  tokenUrl: "",
  userinfoUrl: "",
  jwksUrl: "",
  logoutUrl: "",
  scopes: ["openid", "profile", "email"],
  usernameClaim: "preferred_username",
  emailClaim: "email",
  groupsClaim: "groups",
  allowAutoCreate: false,
  matchByEmail: true,
  matchByUsername: true,
  syncGroups: false
};

export async function getOidcConfig(): Promise<OidcConfig> {
  const raw = await getSetting("oidc_config");
  let parsed: Partial<OidcConfig> = {};
  if (raw) {
    try {
      parsed = OidcConfigSchema.parse(JSON.parse(raw));
    } catch {
      parsed = {};
    }
  }

  const withEnv: Partial<OidcConfig> = {};
  const envIssuer = process.env.OIDC_ISSUER?.trim();
  const envClientId = process.env.OIDC_CLIENT_ID?.trim();
  const envClientSecret = process.env.OIDC_CLIENT_SECRET?.trim();
  const envRedirectUri = process.env.OIDC_REDIRECT_URI?.trim();
  if (envIssuer) withEnv.issuer = envIssuer;
  if (envClientId) withEnv.clientId = envClientId;
  if (envClientSecret) withEnv.clientSecret = envClientSecret;
  if (envRedirectUri) withEnv.redirectUri = envRedirectUri;

  return {
    ...OidcConfigDefaults,
    ...withEnv,
    ...parsed,
    scopes: Array.isArray(parsed.scopes) && parsed.scopes.length ? parsed.scopes : OidcConfigDefaults.scopes,
    redirectUri: parsed.redirectUri ?? withEnv.redirectUri ?? OidcConfigDefaults.redirectUri
  };
}

export async function setOidcConfig(input: OidcConfig): Promise<void> {
  await setSetting("oidc_config", JSON.stringify(input));
}

export async function createNotificationEndpoint(input: {
  name: string;
  type: NotificationEndpointType;
  enabled?: boolean;
  is_global?: boolean;
  events?: string[];
  config: NotificationEndpointConfig;
}) {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
    RETURNING id, name, type, enabled, is_global, events, types, created_at
    `,
    [
      input.name,
      input.type,
      input.enabled ?? true,
      input.is_global ?? false,
      JSON.stringify(
        input.events ?? [
          "request_pending",
          "request_submitted",
          "request_denied",
          "request_failed",
          "request_already_exists",
          "request_available",
          "request_removed",
          "issue_reported",
          "issue_resolved"
        ]
      ),
      JSON.stringify(input.config ?? {})
    ]
  );
  const row = res.rows[0];
  return {
    id: row.id as number,
    name: row.name as string,
    type: row.type as NotificationEndpointType,
    enabled: !!row.enabled,
    is_global: !!row.is_global,
    events: Array.isArray(row.events) ? row.events.map((e: unknown) => String(e)) : [],
    types: Number.isFinite(Number(row.types)) ? Number(row.types) : 0,
    created_at: row.created_at as string
  };
}

export async function deleteNotificationEndpoint(id: number) {
  await ensureSchema();
  const p = getPool();
  await p.query(`DELETE FROM notification_endpoint WHERE id = $1`, [id]);
}

export async function getNotificationEndpointByIdFull(id: number): Promise<NotificationEndpointFull | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, events, types, config, created_at
    FROM notification_endpoint
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    enabled: !!r.enabled,
    is_global: !!r.is_global,
    events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
    types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
    config: r.config,
    created_at: r.created_at
  };
}

export async function updateNotificationEndpoint(
  id: number,
  input: { name: string; enabled: boolean; is_global: boolean; events: string[]; config: NotificationEndpointConfig }
): Promise<NotificationEndpointPublic | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    UPDATE notification_endpoint
    SET name = $2,
        enabled = $3,
        is_global = $4,
        events = $5::jsonb,
        config = $6::jsonb
    WHERE id = $1
    RETURNING id, name, type, enabled, is_global, events, types, created_at
    `,
    [
      id,
      input.name,
      input.enabled,
      input.is_global,
      JSON.stringify(input.events ?? []),
      JSON.stringify(input.config ?? {})
    ]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: row.id as number,
    name: row.name as string,
    type: row.type as NotificationEndpointType,
    enabled: !!row.enabled,
    is_global: !!row.is_global,
    events: Array.isArray(row.events) ? row.events.map((e: unknown) => String(e)) : [],
    types: Number.isFinite(Number(row.types)) ? Number(row.types) : 0,
    created_at: row.created_at as string
  };
}

export async function listGlobalNotificationEndpointsFull(): Promise<NotificationEndpointFull[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, events, types, config, created_at
    FROM notification_endpoint
    WHERE enabled = TRUE AND is_global = TRUE
    ORDER BY created_at DESC
    `
  );
  return res.rows.map(r => {
    const id = Number(r.id);
    return {
      id,
      name: r.name,
      type: r.type,
      enabled: !!r.enabled,
      is_global: !!r.is_global,
      events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
      types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
      config: r.config,
      created_at: r.created_at
    };
  });
}

export async function listNotificationEndpointsForUser(userId: number): Promise<NotificationEndpointFull[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT e.id, e.name, e.type, e.enabled, e.is_global, e.events, e.types, e.config, e.created_at
    FROM notification_endpoint e
    JOIN user_notification_endpoint u ON u.endpoint_id = e.id
    WHERE u.user_id = $1
      AND e.enabled = TRUE
    ORDER BY e.created_at DESC
    `,
    [userId]
  );
  return res.rows.map(r => {
    const id = Number(r.id);
    return {
      id,
      name: r.name,
      type: r.type,
      enabled: !!r.enabled,
      is_global: !!r.is_global,
      events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
      types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
      config: r.config,
      created_at: r.created_at
    };
  });
}

export async function getRequestNotificationContext(requestId: string): Promise<{
  id: string;
  request_type: "movie" | "episode";
  tmdb_id: number;
  title: string;
  status: string;
  created_at: string;
  username: string;
  user_id: number;
} | null> {
  const p = getPool();
  const res = await p.query(
    `
    SELECT r.id, r.request_type, r.tmdb_id, r.title, r.status, r.created_at, r.requested_by as user_id, u.username
    FROM media_request r
    JOIN app_user u ON u.id = r.requested_by
    WHERE r.id = $1
    LIMIT 1
    `,
    [requestId]
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: r.id as string,
    request_type: r.request_type as "movie" | "episode",
    tmdb_id: r.tmdb_id as number,
    title: r.title as string,
    status: r.status as string,
    created_at: r.created_at as string,
    username: r.username as string,
    user_id: r.user_id as number
  };
}

export async function listUserNotificationEndpointIds(userId: number): Promise<number[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT endpoint_id
    FROM user_notification_endpoint
    WHERE user_id = $1
    ORDER BY endpoint_id ASC
    `,
    [userId]
  );
  return res.rows
    .map(r => Number(r.endpoint_id))
    .filter(n => Number.isFinite(n));
}

export async function setUserNotificationEndpointIds(userId: number, endpointIds: number[]) {
  await ensureSchema();
  const p = getPool();
  await p.query("BEGIN");
  try {
    await p.query(`DELETE FROM user_notification_endpoint WHERE user_id = $1`, [userId]);
    const unique = Array.from(new Set(endpointIds)).filter(n => Number.isFinite(n));
    for (const endpointId of unique) {
      await p.query(
        `INSERT INTO user_notification_endpoint (user_id, endpoint_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, endpointId]
      );
    }
    await p.query("COMMIT");
  } catch (e) {
    await p.query("ROLLBACK");
    throw e;
  }
}

// ============================================
// Request Comments
// ============================================

export async function addRequestComment(input: {
  requestId: string;
  userId: number;
  comment: string;
  isAdminComment: boolean;
}) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO request_comment (request_id, user_id, comment, is_admin_comment)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [input.requestId, input.userId, input.comment, input.isAdminComment]
  );
  return {
    id: res.rows[0].id as number,
    createdAt: res.rows[0].created_at as string,
  };
}

export async function getRequestComments(requestId: string) {
  const p = getPool();
  const res = await p.query(
    `SELECT 
      rc.id,
      rc.request_id,
      rc.comment,
      rc.is_admin_comment,
      rc.created_at,
      u.id as user_id,
      u.username,
      u.avatar_url,
      u.groups
     FROM request_comment rc
     JOIN app_user u ON rc.user_id = u.id
     WHERE rc.request_id = $1
     ORDER BY rc.created_at ASC`,
    [requestId]
  );
  return res.rows.map(r => ({
    id: r.id as number,
    requestId: r.request_id as string,
    comment: r.comment as string,
    isAdminComment: r.is_admin_comment as boolean,
    createdAt: r.created_at as string,
    user: {
      id: r.user_id as number,
      username: r.username as string,
      avatarUrl: r.avatar_url as string | null,
      groups: (r.groups as string).split(",").filter(Boolean),
    },
  }));
}

export async function getRequestCommentCount(requestId: string): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*) as count FROM request_comment WHERE request_id = $1`,
    [requestId]
  );
  return parseInt(res.rows[0].count, 10);
}

// ============================================
// Auto-Approval Rules
// ============================================

export async function createApprovalRule(input: {
  name: string;
  description?: string;
  enabled: boolean;
  priority: number;
  ruleType: string;
  conditions: Record<string, unknown>;
}) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO approval_rule (name, description, enabled, priority, rule_type, conditions)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, created_at`,
    [input.name, input.description ?? null, input.enabled, input.priority, input.ruleType, JSON.stringify(input.conditions)]
  );
  return {
    id: res.rows[0].id as number,
    createdAt: res.rows[0].created_at as string,
  };
}

export async function updateApprovalRule(id: number, input: {
  name?: string;
  description?: string;
  enabled?: boolean;
  priority?: number;
  conditions?: Record<string, unknown>;
}) {
  const p = getPool();
  const updates: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (input.name !== undefined) {
    updates.push(`name = $${paramIdx++}`);
    values.push(input.name);
  }
  if (input.description !== undefined) {
    updates.push(`description = $${paramIdx++}`);
    values.push(input.description);
  }
  if (input.enabled !== undefined) {
    updates.push(`enabled = $${paramIdx++}`);
    values.push(input.enabled);
  }
  if (input.priority !== undefined) {
    updates.push(`priority = $${paramIdx++}`);
    values.push(input.priority);
  }
  if (input.conditions !== undefined) {
    updates.push(`conditions = $${paramIdx++}`);
    values.push(JSON.stringify(input.conditions));
  }

  if (updates.length === 0) return;

  updates.push(`updated_at = NOW()`);
  values.push(id);

  await p.query(
    `UPDATE approval_rule SET ${updates.join(", ")} WHERE id = $${paramIdx}`,
    values
  );
}

export async function deleteApprovalRule(id: number) {
  const p = getPool();
  await p.query(`DELETE FROM approval_rule WHERE id = $1`, [id]);
}

export async function listApprovalRules() {
  const p = getPool();
  const res = await p.query(
    `SELECT id, name, description, enabled, priority, rule_type, conditions, created_at, updated_at
     FROM approval_rule
     ORDER BY priority DESC, created_at DESC`
  );
  return res.rows.map(r => ({
    id: r.id as number,
    name: r.name as string,
    description: r.description as string | null,
    enabled: r.enabled as boolean,
    priority: r.priority as number,
    ruleType: r.rule_type as string,
    conditions: r.conditions as Record<string, unknown>,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }));
}

export async function getApprovalRuleById(id: number) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, name, description, enabled, priority, rule_type, conditions, created_at, updated_at
     FROM approval_rule
     WHERE id = $1`,
    [id]
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: r.id as number,
    name: r.name as string,
    description: r.description as string | null,
    enabled: r.enabled as boolean,
    priority: r.priority as number,
    ruleType: r.rule_type as string,
    conditions: r.conditions as Record<string, unknown>,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function getActiveApprovalRules() {
  const p = getPool();
  const res = await p.query(
    `SELECT id, name, rule_type, conditions, priority
     FROM approval_rule
     WHERE enabled = TRUE
     ORDER BY priority DESC`
  );
  return res.rows.map(r => ({
    id: r.id as number,
    name: r.name as string,
    ruleType: r.rule_type as string,
    conditions: r.conditions as Record<string, unknown>,
    priority: r.priority as number,
  }));
}

// ============================================
// Push Subscriptions
// ============================================

export async function savePushSubscription(input: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO push_subscription (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, endpoint)
     DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, last_used_at = NOW()
     RETURNING id`,
    [input.userId, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null]
  );
  return { id: res.rows[0].id as number };
}

export async function deletePushSubscription(userId: number, endpoint: string) {
  const p = getPool();
  await p.query(
    `DELETE FROM push_subscription WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint]
  );
}

export async function getUserPushSubscriptions(userId: number) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, endpoint, p256dh, auth, user_agent, created_at, last_used_at
     FROM push_subscription
     WHERE user_id = $1
     ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );
  return res.rows.map(r => ({
    id: r.id as number,
    endpoint: r.endpoint as string,
    keys: {
      p256dh: r.p256dh as string,
      auth: r.auth as string,
    },
    userAgent: r.user_agent as string | null,
    createdAt: r.created_at as string,
    lastUsedAt: r.last_used_at as string | null,
  }));
}

export async function updatePushSubscriptionLastUsed(subscriptionId: number) {
  const p = getPool();
  await p.query(
    `UPDATE push_subscription SET last_used_at = NOW() WHERE id = $1`,
    [subscriptionId]
  );
}

// ============================================
// Request Analytics
// ============================================

export async function getRequestAnalytics(input: {
  startDate?: string;
  endDate?: string;
}): Promise<{
  totalRequests: number;
  movieRequests: number;
  tvRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  deniedRequests: number;
  avgApprovalTimeHours: number;
  topRequesters: Array<{ username: string; count: number }>;
  requestsByDay: Array<{ date: string; count: number }>;
  requestsByStatus: Array<{ status: string; count: number }>;
}> {
  const p = getPool();

  const dateFilter = input.startDate && input.endDate
    ? `WHERE mr.created_at >= $1 AND mr.created_at <= $2`
    : input.startDate
      ? `WHERE mr.created_at >= $1`
      : input.endDate
        ? `WHERE mr.created_at <= $1`
        : "";

  const params = input.startDate && input.endDate
    ? [input.startDate, input.endDate]
    : input.startDate || input.endDate
      ? [input.startDate || input.endDate]
      : [];

  // Overall stats
  const statsQuery = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(CASE WHEN request_type = 'movie' THEN 1 END)::int AS movies,
      COUNT(CASE WHEN request_type = 'episode' THEN 1 END)::int AS tv,
      COUNT(CASE WHEN status IN ('pending', 'queued') THEN 1 END)::int AS pending,
      COUNT(CASE WHEN status IN ('submitted', 'available') THEN 1 END)::int AS approved,
      COUNT(CASE WHEN status = 'denied' THEN 1 END)::int AS denied
    FROM media_request mr
    ${dateFilter}
  `;
  const statsRes = await p.query(statsQuery, params);
  const stats = statsRes.rows[0];

  // Top requesters
  const topRequestersQuery = `
    SELECT u.username, COUNT(*)::int as count
    FROM media_request mr
    JOIN app_user u ON mr.requested_by = u.id
    ${dateFilter}
    GROUP BY u.username
    ORDER BY count DESC
    LIMIT 10
  `;
  const topRequestersRes = await p.query(topRequestersQuery, params);
  const topRequesters = topRequestersRes.rows.map(r => ({
    username: r.username as string,
    count: r.count as number,
  }));

  // Requests by day (last 30 days)
  const requestsByDayQuery = `
    SELECT DATE(mr.created_at) as date, COUNT(*)::int as count
    FROM media_request mr
    WHERE mr.created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(mr.created_at)
    ORDER BY date ASC
  `;
  const requestsByDayRes = await p.query(requestsByDayQuery);
  const requestsByDay = requestsByDayRes.rows.map(r => ({
    date: r.date as string,
    count: r.count as number,
  }));

  // Requests by status
  const requestsByStatusQuery = `
    SELECT status, COUNT(*)::int as count
    FROM media_request mr
    ${dateFilter}
    GROUP BY status
    ORDER BY count DESC
  `;
  const requestsByStatusRes = await p.query(requestsByStatusQuery, params);
  const requestsByStatus = requestsByStatusRes.rows.map(r => ({
    status: r.status as string,
    count: r.count as number,
  }));

  // Average approval time (from pending to submitted/available)
  const avgTimeQuery = `
    SELECT EXTRACT(EPOCH FROM AVG(
      CASE
        WHEN status IN ('submitted', 'available') 
        THEN NOW() - created_at
        ELSE NULL
      END
    )) / 3600 as avg_hours
    FROM media_request mr
    ${dateFilter}
  `;
  const avgTimeRes = await p.query(avgTimeQuery, params);
  const avgApprovalTimeHours = parseFloat(avgTimeRes.rows[0]?.avg_hours ?? "0") || 0;

  return {
    totalRequests: stats.total,
    movieRequests: stats.movies,
    tvRequests: stats.tv,
    pendingRequests: stats.pending,
    approvedRequests: stats.approved,
    deniedRequests: stats.denied,
    avgApprovalTimeHours,
    topRequesters,
    requestsByDay,
    requestsByStatus,
  };
}
// Web Push Preferences
export async function getWebPushPreference(userId: number): Promise<boolean | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT web_push_enabled FROM app_user WHERE id = $1`,
    [userId]
  );
  return res.rows[0]?.web_push_enabled ?? null;
}

export async function setWebPushPreference(userId: number, enabled: boolean): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE app_user SET web_push_enabled = $1 WHERE id = $2`,
    [enabled, userId]
  );
}

export async function getWeeklyDigestPreference(userId: number): Promise<boolean | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT weekly_digest_opt_in FROM app_user WHERE id = $1`,
    [userId]
  );
  return res.rows[0]?.weekly_digest_opt_in ?? null;
}

export async function setWeeklyDigestPreference(userId: number, enabled: boolean): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE app_user SET weekly_digest_opt_in = $1 WHERE id = $2`,
    [enabled, userId]
  );
}

export async function listWeeklyDigestRecipients(): Promise<Array<{ id: number; email: string; username: string }>> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, email, username
     FROM app_user
     WHERE weekly_digest_opt_in = true
       AND email IS NOT NULL
       AND banned = false`
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    email: row.email,
    username: row.username
  }));
}

export async function listUpgradeFinderHints(): Promise<UpgradeFinderHint[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT media_type, media_id, status, hint_text, checked_at
     FROM upgrade_finder_hint
     ORDER BY checked_at DESC`
  );
  return res.rows.map((row) => ({
    mediaType: row.media_type,
    mediaId: Number(row.media_id),
    status: row.status,
    hintText: row.hint_text ?? null,
    checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null
  }));
}

export async function upsertUpgradeFinderHint(input: {
  mediaType: "movie" | "tv";
  mediaId: number;
  status: "available" | "none" | "error";
  hintText?: string | null;
}) {
  await ensureSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO upgrade_finder_hint (media_type, media_id, status, hint_text, checked_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (media_type, media_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      hint_text = EXCLUDED.hint_text,
      checked_at = EXCLUDED.checked_at
    `,
    [input.mediaType, input.mediaId, input.status, input.hintText ?? null]
  );
}

export async function listUpgradeFinderOverrides(): Promise<UpgradeFinderOverride[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT media_type, media_id, ignore_4k, updated_at
     FROM upgrade_finder_override
     ORDER BY updated_at DESC`
  );
  return res.rows.map((row) => ({
    mediaType: row.media_type,
    mediaId: Number(row.media_id),
    ignore4k: !!row.ignore_4k,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  }));
}

export async function upsertUpgradeFinderOverride(input: {
  mediaType: "movie" | "tv";
  mediaId: number;
  ignore4k: boolean;
}) {
  await ensureSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO upgrade_finder_override (media_type, media_id, ignore_4k, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (media_type, media_id)
    DO UPDATE SET
      ignore_4k = EXCLUDED.ignore_4k,
      updated_at = EXCLUDED.updated_at
    `,
    [input.mediaType, input.mediaId, input.ignore4k]
  );
}

export type Job = {
  id: number;
  name: string;
  schedule: string;
  intervalSeconds: number;
  type: "system" | "user";
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  runOnStart: boolean;
  failureCount: number;
  lastError: string | null;
  disabledReason: string | null;
};

export async function listJobs(): Promise<Job[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(`SELECT * FROM jobs ORDER BY name ASC`);
  return res.rows.map(r => ({
    id: r.id,
    name: r.name,
    schedule: r.schedule,
    intervalSeconds: r.interval_seconds,
    type: r.type,
    enabled: r.enabled,
    lastRun: r.last_run,
    nextRun: r.next_run,
    runOnStart: r.run_on_start,
    failureCount: r.failure_count ?? 0,
    lastError: r.last_error ?? null,
    disabledReason: r.disabled_reason ?? null
  }));
}

export async function getJob(name: string): Promise<Job | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(`SELECT * FROM jobs WHERE name = $1`, [name]);
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    name: r.name,
    schedule: r.schedule,
    intervalSeconds: r.interval_seconds,
    type: r.type,
    enabled: r.enabled,
    lastRun: r.last_run,
    nextRun: r.next_run,
    runOnStart: r.run_on_start,
    failureCount: r.failure_count ?? 0,
    lastError: r.last_error ?? null,
    disabledReason: r.disabled_reason ?? null
  };
}

export async function updateJob(id: number, schedule: string, intervalSeconds: number) {
  const p = getPool();
  await p.query(
    `UPDATE jobs SET schedule = $1, interval_seconds = $2 WHERE id = $3`,
    [schedule, intervalSeconds, id]
  );
}

export async function updateJobSchedule(id: number, schedule: string, intervalSeconds: number, nextRun: Date) {
  const p = getPool();
  await p.query(
    `UPDATE jobs
     SET schedule = $1,
         interval_seconds = $2,
         next_run = $3
     WHERE id = $4`,
    [schedule, intervalSeconds, nextRun, id]
  );
}

export async function updateJobRun(id: number, lastRun: Date, nextRun: Date) {
  const p = getPool();
  await p.query(
    `UPDATE jobs
     SET last_run = $1,
         next_run = $2,
         failure_count = 0,
         last_error = NULL
     WHERE id = $3`,
    [lastRun, nextRun, id]
  );
}

export async function updateJobEnabled(id: number, enabled: boolean, nextRun?: Date): Promise<void> {
  const p = getPool();
  if (enabled) {
    await p.query(
      `UPDATE jobs
       SET enabled = TRUE,
           disabled_reason = NULL,
           failure_count = 0,
           last_error = NULL,
           next_run = COALESCE($2, next_run)
       WHERE id = $1`,
      [id, nextRun ?? null]
    );
    return;
  }
  await p.query(
    `UPDATE jobs
     SET enabled = FALSE,
         disabled_reason = $2
     WHERE id = $1`,
    [id, "Disabled by admin"]
  );
}

export async function recordJobFailure(id: number, error: string, maxFailures: number): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `UPDATE jobs
     SET failure_count = COALESCE(failure_count, 0) + 1,
         last_error = $2
     WHERE id = $1
     RETURNING failure_count`,
    [id, error]
  );
  const failures = Number(res.rows[0]?.failure_count ?? 0);
  if (failures >= maxFailures) {
    await p.query(
      `UPDATE jobs
       SET enabled = FALSE,
           disabled_reason = $2
       WHERE id = $1`,
      [id, `Disabled after ${failures} failures`]
    );
  }
  return failures;
}

// ===== User Notifications =====
export type UserNotification = {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export async function createNotification(params: {
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<UserNotification> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO user_notification (user_id, type, title, message, link, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id as "userId", type, title, message, link, is_read as "isRead", metadata, created_at as "createdAt"`,
    [params.userId, params.type, params.title, params.message, params.link ?? null, params.metadata ? JSON.stringify(params.metadata) : null]
  );
  return res.rows[0];
}

export async function getUserNotifications(userId: number, limit = 50): Promise<UserNotification[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id as "userId", type, title, message, link, is_read as "isRead", metadata, created_at as "createdAt"
     FROM user_notification
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

export async function getUnreadNotifications(userId: number): Promise<UserNotification[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id as "userId", type, title, message, link, is_read as "isRead", metadata, created_at as "createdAt"
     FROM user_notification
     WHERE user_id = $1 AND is_read = false
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );
  return res.rows;
}

export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*)::int as count FROM user_notification WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return res.rows[0]?.count ?? 0;
}

export async function markNotificationAsRead(notificationId: number, userId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE user_notification SET is_read = true WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function markAllNotificationsAsRead(userId: number): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE user_notification SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
}

export async function deleteNotification(notificationId: number, userId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `DELETE FROM user_notification WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

// ===== Recently Viewed =====
export type RecentlyViewed = {
  userId: number;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  posterPath: string | null;
  lastViewedAt: string;
};

export async function trackRecentlyViewed(params: {
  userId: number;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  title: string;
  posterPath?: string | null;
}): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO recently_viewed (user_id, media_type, tmdb_id, title, poster_path, last_viewed_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, media_type, tmdb_id)
     DO UPDATE SET last_viewed_at = NOW(), title = $4, poster_path = $5`,
    [params.userId, params.mediaType, params.tmdbId, params.title, params.posterPath ?? null]
  );
}

export async function getRecentlyViewed(userId: number, limit = 20): Promise<RecentlyViewed[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT user_id as "userId", media_type as "mediaType", tmdb_id as "tmdbId", 
            title, poster_path as "posterPath", last_viewed_at as "lastViewedAt"
     FROM recently_viewed
     WHERE user_id = $1
     ORDER BY last_viewed_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

export async function clearRecentlyViewed(userId: number): Promise<void> {
  const p = getPool();
  await p.query(`DELETE FROM recently_viewed WHERE user_id = $1`, [userId]);
}
// ===== Media Shares =====
export type MediaShare = {
  id: number;
  token: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  createdBy: number;
  expiresAt: string | null;
  viewCount: number;
  maxViews: number | null;
  passwordHash?: string | null;
  lastViewedAt?: string | null;
  lastViewedIp?: string | null;
  lastViewedReferrer?: string | null;
  lastViewedCountry?: string | null;
  lastViewedUaHash?: string | null;
  createdAt: string;
};

export async function createMediaShare(params: {
  token: string;
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  createdBy: number;
  expiresAt?: Date | null;
  maxViews?: number | null;
  passwordHash?: string | null;
}): Promise<MediaShare> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO media_share (token, media_type, tmdb_id, created_by, expires_at, max_views, password_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, token, media_type as "mediaType", tmdb_id as "tmdbId", 
               created_by as "createdBy", expires_at as "expiresAt", 
               view_count as "viewCount", max_views as "maxViews", created_at as "createdAt"`,
    [
      params.token,
      params.mediaType,
      params.tmdbId,
      params.createdBy,
      params.expiresAt ?? null,
      params.maxViews ?? null,
      params.passwordHash ?? null,
    ]
  );
  return res.rows[0];
}

export async function getMediaShareByToken(token: string): Promise<MediaShare | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, token, media_type as "mediaType", tmdb_id as "tmdbId",
            created_by as "createdBy", expires_at as "expiresAt",
            view_count as "viewCount", max_views as "maxViews",
            password_hash as "passwordHash",
            last_viewed_at as "lastViewedAt", last_viewed_ip as "lastViewedIp",
            last_viewed_referrer as "lastViewedReferrer",
            last_viewed_country as "lastViewedCountry",
            last_viewed_ua_hash as "lastViewedUaHash",
            created_at as "createdAt"
     FROM media_share
     WHERE token = $1`,
    [token]
  );
  return res.rows[0] || null;
}

export async function getMediaShareById(id: number): Promise<MediaShare | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, token, media_type as "mediaType", tmdb_id as "tmdbId",
            created_by as "createdBy", expires_at as "expiresAt",
            view_count as "viewCount", max_views as "maxViews",
            password_hash as "passwordHash",
            last_viewed_at as "lastViewedAt", last_viewed_ip as "lastViewedIp",
            last_viewed_referrer as "lastViewedReferrer",
            last_viewed_country as "lastViewedCountry",
            last_viewed_ua_hash as "lastViewedUaHash",
            created_at as "createdAt"
     FROM media_share
     WHERE id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

export async function incrementShareViewCount(token: string): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE media_share SET view_count = view_count + 1 WHERE token = $1`,
    [token]
  );
}

export async function incrementShareViewCountById(
  id: number,
  meta?: {
    lastViewedIp?: string | null;
    lastViewedReferrer?: string | null;
    lastViewedCountry?: string | null;
    lastViewedUaHash?: string | null;
  }
): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE media_share
     SET view_count = view_count + 1,
         last_viewed_at = NOW(),
         last_viewed_ip = $2,
         last_viewed_referrer = $3,
         last_viewed_country = $4,
         last_viewed_ua_hash = $5
     WHERE id = $1`,
    [
      id,
      meta?.lastViewedIp ?? null,
      meta?.lastViewedReferrer ?? null,
      meta?.lastViewedCountry ?? null,
      meta?.lastViewedUaHash ?? null,
    ]
  );
}

export async function getRecentSharesByUser(userId: number, limit = 10): Promise<MediaShare[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, token, media_type as "mediaType", tmdb_id as "tmdbId", 
            created_by as "createdBy", expires_at as "expiresAt", 
            view_count as "viewCount", max_views as "maxViews", created_at as "createdAt"
     FROM media_share
     WHERE created_by = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

export async function deleteMediaShare(id: number, userId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `DELETE FROM media_share WHERE id = $1 AND created_by = $2`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function countRecentSharesByUser(userId: number, minutes = 60): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*) as count FROM media_share 
     WHERE created_by = $1 AND created_at > NOW() - INTERVAL '${minutes} minutes'`,
    [userId]
  );
  return parseInt(res.rows[0]?.count ?? '0', 10);
}

export interface MediaShareWithUser extends MediaShare {
  createdByUsername: string;
  passwordSet: boolean;
}

export async function getAllMediaShares(): Promise<MediaShareWithUser[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT 
      ms.id, ms.token, ms.media_type as "mediaType", ms.tmdb_id as "tmdbId", 
      ms.created_by as "createdBy", ms.expires_at as "expiresAt", 
      ms.view_count as "viewCount", ms.max_views as "maxViews",
      (ms.password_hash IS NOT NULL) as "passwordSet",
      ms.last_viewed_at as "lastViewedAt", ms.last_viewed_ip as "lastViewedIp",
      ms.last_viewed_referrer as "lastViewedReferrer",
      ms.last_viewed_country as "lastViewedCountry",
      ms.last_viewed_ua_hash as "lastViewedUaHash",
      ms.created_at as "createdAt",
      u.username as "createdByUsername"
     FROM media_share ms
     JOIN app_user u ON ms.created_by = u.id
     ORDER BY ms.created_at DESC`
  );
  return res.rows;
}

export async function deleteMediaShareByAdmin(id: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `DELETE FROM media_share WHERE id = $1 RETURNING token`,
    [id]
  );
  return (res.rowCount ?? 0) > 0;
}

// ===== Calendar Preferences =====

export interface CalendarPreferences {
  userId: number;
  defaultView: 'month' | 'week' | 'list' | 'agenda';
  filters: {
    movies: boolean;
    tv: boolean;
    requests: boolean;
    sonarr: boolean;
    radarr: boolean;
  };
  genreFilters: number[];
  monitoredOnly: boolean;
  createdAt: string;
  updatedAt: string;
}

export async function getCalendarPreferences(userId: number): Promise<CalendarPreferences | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      user_id as "userId",
      default_view as "defaultView",
      filters,
      genre_filters as "genreFilters",
      monitored_only as "monitoredOnly",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM calendar_preferences
    WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function setCalendarPreferences(
  userId: number,
  prefs: {
    defaultView?: 'month' | 'week' | 'list' | 'agenda';
    filters?: Record<string, unknown> | null;
    genreFilters?: number[];
    monitoredOnly?: boolean;
  }
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO calendar_preferences
      (user_id, default_view, filters, genre_filters, monitored_only, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      default_view = COALESCE($2, calendar_preferences.default_view),
      filters = COALESCE($3, calendar_preferences.filters),
      genre_filters = COALESCE($4, calendar_preferences.genre_filters),
      monitored_only = COALESCE($5, calendar_preferences.monitored_only),
      updated_at = NOW()`,
    [
      userId,
      prefs.defaultView || null,
      prefs.filters ? JSON.stringify(prefs.filters) : null,
      prefs.genreFilters || null,
      prefs.monitoredOnly !== undefined ? prefs.monitoredOnly : null
    ]
  );
}

// ===== Calendar Feed Tokens =====

export async function getCalendarFeedToken(userId: number): Promise<string> {
  const pool = getPool();
  const existing = await pool.query<{ token: string }>(
    `SELECT token
     FROM calendar_feed_token
     WHERE user_id = $1`,
    [userId]
  );
  if (existing.rows[0]?.token) return existing.rows[0].token;

  const inserted = await pool.query<{ token: string }>(
    `INSERT INTO calendar_feed_token (user_id)
     VALUES ($1)
     RETURNING token`,
    [userId]
  );
  return inserted.rows[0].token;
}

export async function rotateCalendarFeedToken(userId: number): Promise<string> {
  const pool = getPool();
  const result = await pool.query<{ token: string }>(
    `INSERT INTO calendar_feed_token (user_id, token, rotated_at)
     VALUES ($1, uuid_generate_v4(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET token = uuid_generate_v4(), rotated_at = NOW()
     RETURNING token`,
    [userId]
  );
  return result.rows[0].token;
}

export async function getCalendarFeedUserByToken(token: string): Promise<{ id: number; username: string } | null> {
  const pool = getPool();
  const result = await pool.query<{ id: number; username: string }>(
    `SELECT u.id, u.username
     FROM calendar_feed_token cft
     JOIN app_user u ON u.id = cft.user_id
     WHERE cft.token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

// ===== Calendar Event Subscriptions =====

export interface CalendarEventSubscription {
  id: string;
  userId: number;
  eventType: 'movie_release' | 'tv_premiere' | 'tv_episode' | 'season_premiere';
  tmdbId: number;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  notifyOnAvailable: boolean;
  createdAt: string;
}

export async function listCalendarSubscriptions(userId: number): Promise<CalendarEventSubscription[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      id,
      user_id as "userId",
      event_type as "eventType",
      tmdb_id as "tmdbId",
      season_number as "seasonNumber",
      episode_number as "episodeNumber",
      notify_on_available as "notifyOnAvailable",
      created_at as "createdAt"
    FROM calendar_event_subscription
    WHERE user_id = $1
    ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function addCalendarSubscription(data: {
  userId: number;
  eventType: 'movie_release' | 'tv_premiere' | 'tv_episode' | 'season_premiere';
  tmdbId: number;
  seasonNumber?: number;
  episodeNumber?: number;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO calendar_event_subscription
      (user_id, event_type, tmdb_id, season_number, episode_number)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, event_type, tmdb_id, season_number, episode_number)
    DO UPDATE SET notify_on_available = true`,
    [data.userId, data.eventType, data.tmdbId, data.seasonNumber || null, data.episodeNumber || null]
  );
}

export async function removeCalendarSubscription(subscriptionId: string, userId: number): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM calendar_event_subscription
    WHERE id = $1 AND user_id = $2`,
    [subscriptionId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listActiveCalendarSubscriptions(): Promise<CalendarEventSubscription[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      id,
      user_id as "userId",
      event_type as "eventType",
      tmdb_id as "tmdbId",
      season_number as "seasonNumber",
      episode_number as "episodeNumber",
      notify_on_available as "notifyOnAvailable",
      created_at as "createdAt"
    FROM calendar_event_subscription
    WHERE notify_on_available = true
    ORDER BY created_at ASC`
  );
  return result.rows;
}

export async function disableCalendarSubscriptionNotifications(subscriptionId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE calendar_event_subscription
    SET notify_on_available = false
    WHERE id = $1`,
    [subscriptionId]
  );
}

// ===== Jellyfin Availability Cache =====

export type JellyfinAvailabilityItem = {
  id: number;
  tmdbId: number | null;
  tvdbId: number | null;
  imdbId: string | null;
  mediaType: 'movie' | 'episode' | 'season' | 'series';
  title: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  airDate: string | null;
  jellyfinItemId: string;
  jellyfinLibraryId: string | null;
  lastScannedAt: string;
  createdAt: string;
};

export type JellyfinScanLog = {
  id: number;
  libraryId: string | null;
  libraryName: string | null;
  itemsScanned: number;
  itemsAdded: number;
  itemsRemoved: number;
  scanStartedAt: string;
  scanCompletedAt: string | null;
  scanStatus: 'running' | 'completed' | 'failed';
  errorMessage: string | null;
};

export type NewJellyfinItem = {
  jellyfinItemId: string;
  title: string | null;
  mediaType: 'movie' | 'episode' | 'season' | 'series';
  tmdbId: number | null;
  addedAt: string;
};

export async function hasCachedEpisodeAvailability(params: {
  tmdbId: number;
  tvdbId?: number | null;
}): Promise<boolean> {
  const p = getPool();
  const tvdbId = params.tvdbId ?? null;
  const res = await p.query(
    `SELECT 1
     FROM jellyfin_availability
     WHERE media_type = 'episode'
       AND (tmdb_id = $1 OR ($2::int IS NOT NULL AND tvdb_id = $2::int))
     LIMIT 1`,
    [params.tmdbId, tvdbId]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getAvailableSeasons(params: {
  tmdbId: number;
  tvdbId?: number | null;
}): Promise<number[]> {
  const p = getPool();
  const tvdbId = params.tvdbId ?? null;
  const res = await p.query(
    `SELECT DISTINCT season_number
     FROM jellyfin_availability
     WHERE media_type = 'episode'
       AND season_number IS NOT NULL
       AND (tmdb_id = $1 OR ($2::int IS NOT NULL AND tvdb_id = $2::int))
     ORDER BY season_number`,
    [params.tmdbId, tvdbId]
  );
  return res.rows.map((row: any) => row.season_number);
}

export async function getCachedJellyfinSeriesItemId(params: {
  tmdbId: number;
  tvdbId?: number | null;
}): Promise<string | null> {
  const p = getPool();
  const tvdbId = params.tvdbId ?? null;
  const res = await p.query(
    `SELECT jellyfin_item_id
     FROM jellyfin_availability
     WHERE media_type = 'series'
       AND (tmdb_id = $1 OR ($2::int IS NOT NULL AND tvdb_id = $2::int))
     ORDER BY last_scanned_at DESC
     LIMIT 1`,
    [params.tmdbId, tvdbId]
  );
  return res.rows[0]?.jellyfin_item_id ?? null;
}

export async function upsertJellyfinAvailability(params: {
  tmdbId?: number | null;
  tvdbId?: number | null;
  imdbId?: string | null;
  mediaType: 'movie' | 'episode' | 'season' | 'series';
  title?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  airDate?: string | null;
  jellyfinItemId: string;
  jellyfinLibraryId?: string | null;
}): Promise<{ isNew: boolean }> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO jellyfin_availability
      (tmdb_id, tvdb_id, imdb_id, media_type, title, season_number, episode_number, air_date, jellyfin_item_id, jellyfin_library_id, last_scanned_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
    ON CONFLICT (jellyfin_item_id)
    DO UPDATE SET
      last_scanned_at = NOW(),
      title = COALESCE($5, jellyfin_availability.title),
      tmdb_id = COALESCE($1, jellyfin_availability.tmdb_id),
      tvdb_id = COALESCE($2, jellyfin_availability.tvdb_id),
      imdb_id = COALESCE($3, jellyfin_availability.imdb_id),
      air_date = COALESCE($8, jellyfin_availability.air_date)
    RETURNING (xmax = 0) AS is_new`,
    [
      params.tmdbId ?? null,
      params.tvdbId ?? null,
      params.imdbId ?? null,
      params.mediaType,
      params.title ?? null,
      params.seasonNumber ?? null,
      params.episodeNumber ?? null,
      params.airDate ?? null,
      params.jellyfinItemId,
      params.jellyfinLibraryId ?? null
    ]
  );
  return { isNew: res.rows[0]?.is_new ?? false };
}

export async function getNewJellyfinItems(sinceDate?: Date, limit = 100): Promise<NewJellyfinItem[]> {
  const p = getPool();
  const query = sinceDate
    ? `SELECT jellyfin_item_id as "jellyfinItemId", title, media_type as "mediaType",
              tmdb_id as "tmdbId", created_at as "addedAt"
       FROM jellyfin_availability
       WHERE created_at > $1
       ORDER BY created_at DESC
       LIMIT $2`
    : `SELECT jellyfin_item_id as "jellyfinItemId", title, media_type as "mediaType",
              tmdb_id as "tmdbId", created_at as "addedAt"
       FROM jellyfin_availability
       ORDER BY created_at DESC
       LIMIT $1`;

  const params = sinceDate ? [sinceDate, limit] : [limit];
  const res = await p.query(query, params);
  return res.rows;
}

export async function startJellyfinScan(params: {
  libraryId?: string | null;
  libraryName?: string | null;
}): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO jellyfin_scan_log
      (library_id, library_name, items_scanned, items_added, items_removed, scan_started_at, scan_status)
    VALUES ($1, $2, 0, 0, 0, NOW(), 'running')
    RETURNING id`,
    [params.libraryId ?? null, params.libraryName ?? null]
  );
  return res.rows[0].id;
}

export async function updateJellyfinScan(scanId: number, params: {
  itemsScanned?: number;
  itemsAdded?: number;
  itemsRemoved?: number;
  scanStatus?: 'running' | 'completed' | 'failed';
  errorMessage?: string | null;
}): Promise<void> {
  const p = getPool();
  const updates: string[] = [];
  const values: any[] = [];
  let paramIdx = 1;

  if (params.itemsScanned !== undefined) {
    updates.push(`items_scanned = $${paramIdx++}`);
    values.push(params.itemsScanned);
  }
  if (params.itemsAdded !== undefined) {
    updates.push(`items_added = $${paramIdx++}`);
    values.push(params.itemsAdded);
  }
  if (params.itemsRemoved !== undefined) {
    updates.push(`items_removed = $${paramIdx++}`);
    values.push(params.itemsRemoved);
  }
  if (params.scanStatus) {
    updates.push(`scan_status = $${paramIdx++}`);
    values.push(params.scanStatus);
    if (params.scanStatus === 'completed' || params.scanStatus === 'failed') {
      updates.push(`scan_completed_at = NOW()`);
    }
  }
  if (params.errorMessage !== undefined) {
    updates.push(`error_message = $${paramIdx++}`);
    values.push(params.errorMessage);
  }

  if (updates.length === 0) return;

  values.push(scanId);
  await p.query(
    `UPDATE jellyfin_scan_log SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
    values
  );
}

export async function getRecentJellyfinScans(limit = 10): Promise<JellyfinScanLog[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, library_id as "libraryId", library_name as "libraryName",
            items_scanned as "itemsScanned", items_added as "itemsAdded",
            items_removed as "itemsRemoved", scan_started_at as "scanStartedAt",
            scan_completed_at as "scanCompletedAt", scan_status as "scanStatus",
            error_message as "errorMessage"
     FROM jellyfin_scan_log
     ORDER BY scan_started_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}
