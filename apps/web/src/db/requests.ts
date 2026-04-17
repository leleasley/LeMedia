import { randomUUID } from "crypto";
import { withCache } from "@/lib/local-cache";
import { logger } from "@/lib/logger";
import { normalizeGroupList } from "@/lib/groups";
import { logRequestLifecycleEvent } from "./request-timeline";
import { getPool, ACTIVE_REQUEST_STATUSES, ActiveRequestExistsError, ensureSchema, ensureUserSchema } from "./core";


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


export async function createRequest(input: {
  requestType: "movie" | "episode";
  tmdbId: number;
  title: string;
  userId: number;
  priority?: "low" | "normal" | "high";
  status?: string;
  statusReason?: string | null;
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
      priority,
      status,
      status_reason,
      poster_path,
      backdrop_path,
      release_year
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
    `,
    [
      input.requestType,
      input.tmdbId,
      input.title,
      input.userId,
      input.priority ?? "normal",
      input.status ?? "queued",
      input.statusReason ?? null,
      input.posterPath ?? null,
      input.backdropPath ?? null,
      input.releaseYear ?? null
    ]
  );
  if (!res.rows.length) {
    throw new Error(`Failed to create media request for tmdbId ${input.tmdbId}`);
  }
  const requestId = res.rows[0].id as string;
  await logRequestLifecycleEvent({ requestId, eventType: "requested" });
  if (input.status === "queued") {
    await logRequestLifecycleEvent({ requestId, eventType: "auto_approved" });
  }
  if (input.status === "submitted") {
    await logRequestLifecycleEvent({ requestId, eventType: "submitted_to_service" });
  }
  return { id: requestId };
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
  priority?: "low" | "normal" | "high";
  requestStatus?: string;
  statusReason?: string | null;
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
        priority,
        status,
        status_reason,
        poster_path,
        backdrop_path,
        release_year
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id
      `,
      [
        input.requestType,
        input.tmdbId,
        input.title,
        input.userId,
        input.priority ?? "normal",
        requestStatus,
        input.statusReason ?? null,
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
      await client.query(`UPDATE media_request SET status = $2, status_reason = NULL WHERE id = $1`, [requestId, input.finalStatus]);
    }

    await client.query("COMMIT");
    await logRequestLifecycleEvent({ requestId, eventType: "requested" });
    if (requestStatus === "queued") {
      await logRequestLifecycleEvent({ requestId, eventType: "auto_approved" });
    }
    if (input.finalStatus === "submitted") {
      await logRequestLifecycleEvent({ requestId, eventType: "submitted_to_service" });
    }
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
    SELECT mr.id, mr.status, mr.created_at, mr.requested_by,
           u.username, u.display_name, u.avatar_url, u.jellyfin_user_id
    FROM media_request mr
    LEFT JOIN app_user u ON u.id = mr.requested_by
    WHERE mr.request_type = $1
      AND mr.tmdb_id = $2
      AND mr.status IN ('queued','pending','submitted','downloading','partially_available','available','already_exists')
    ORDER BY mr.created_at DESC
    LIMIT 1
    `,
    [input.requestType, input.tmdbId]
  );
  if (!res.rows.length) return null;
  return {
    id: res.rows[0].id as string,
    status: res.rows[0].status as string,
    createdAt: res.rows[0].created_at as string,
    requestedBy: {
      id: res.rows[0].requested_by as number,
      username: res.rows[0].username as string,
      displayName: res.rows[0].display_name as string | null,
      avatarUrl: res.rows[0].avatar_url as string | null,
      jellyfinUserId: res.rows[0].jellyfin_user_id as string | null
    }
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
      AND status IN ('queued','pending','submitted','downloading','partially_available','available','already_exists')
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
      AND r.status IN ('queued','pending','submitted','downloading','partially_available','available')
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
      AND r.status IN ('queued','pending','submitted','downloading','partially_available','available')
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
        SELECT r.id, r.request_type, r.tmdb_id, r.title, r.priority, r.status, r.status_reason, r.created_at,
               r.poster_path, r.backdrop_path, r.release_year,
               u.username, u.display_name, u.avatar_url, u.jellyfin_user_id,
               COALESCE(v.vote_count, 0)::int AS vote_count
        FROM media_request r
        JOIN app_user u ON u.id = r.requested_by
        LEFT JOIN (
          SELECT request_id, COUNT(*)::int AS vote_count
          FROM request_upvote
          GROUP BY request_id
        ) v ON v.request_id = r.id
        WHERE u.username = $2
        ORDER BY r.created_at DESC
        LIMIT $1
        `
      : `
        SELECT r.id, r.request_type, r.tmdb_id, r.title, r.priority, r.status, r.status_reason, r.created_at,
               r.poster_path, r.backdrop_path, r.release_year,
               u.username, u.display_name, u.avatar_url, u.jellyfin_user_id,
               COALESCE(v.vote_count, 0)::int AS vote_count
        FROM media_request r
        JOIN app_user u ON u.id = r.requested_by
        LEFT JOIN (
          SELECT request_id, COUNT(*)::int AS vote_count
          FROM request_upvote
          GROUP BY request_id
        ) v ON v.request_id = r.id
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
      priority: "low" | "normal" | "high";
      status: string;
      status_reason: string | null;
      created_at: string;
      poster_path: string | null;
      backdrop_path: string | null;
      release_year: number | null;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      jellyfin_user_id: string | null;
      vote_count: number;
    }>;
  });
}


export async function listRequestsByUsername(username: string, limit = 100) {
  const p = getPool();
  let res;
  try {
    res = await p.query(
      `
            SELECT r.id, r.request_type, r.tmdb_id, r.title, r.priority, r.status, r.status_reason, r.created_at,
             r.poster_path, r.backdrop_path, r.release_year,
             u.username,
              COALESCE(du.display_name, du.username) AS denied_by_name,
              COALESCE(v.vote_count, 0)::int AS vote_count
      FROM media_request r
      JOIN app_user u ON u.id = r.requested_by
      LEFT JOIN app_user du ON du.id = r.denied_by_user_id
            LEFT JOIN (
         SELECT request_id, COUNT(*)::int AS vote_count
         FROM request_upvote
         GROUP BY request_id
            ) v ON v.request_id = r.id
      WHERE u.username = $1
      ORDER BY r.created_at DESC
      LIMIT $2
      `,
      [username, limit]
    );
  } catch (err: any) {
    // Backward compatibility: instances that have not run migration 017 yet.
    if (err?.code !== "42703") throw err; // undefined_column
    res = await p.query(
      `
            SELECT r.id, r.request_type, r.tmdb_id, r.title, 'normal'::text AS priority, r.status, r.status_reason, r.created_at,
             r.poster_path, r.backdrop_path, r.release_year,
             u.username,
              NULL::text AS denied_by_name,
              COALESCE(v.vote_count, 0)::int AS vote_count
      FROM media_request r
      JOIN app_user u ON u.id = r.requested_by
            LEFT JOIN (
         SELECT request_id, COUNT(*)::int AS vote_count
         FROM request_upvote
         GROUP BY request_id
            ) v ON v.request_id = r.id
      WHERE u.username = $1
      ORDER BY r.created_at DESC
      LIMIT $2
      `,
      [username, limit]
    );
  }
  return res.rows as Array<{
    id: string;
    request_type: string;
    tmdb_id: number;
    title: string;
    priority: "low" | "normal" | "high";
    status: string;
    status_reason: string | null;
    created_at: string;
    poster_path: string | null;
    backdrop_path: string | null;
    release_year: number | null;
    username: string;
    denied_by_name: string | null;
    vote_count: number;
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
}): Promise<{ total: number; results: Array<{ id: string; request_type: string; tmdb_id: number; title: string; priority: "low" | "normal" | "high"; status: string; status_reason: string | null; created_at: string; username: string; user_id: number; poster_path: string | null; backdrop_path: string | null; release_year: number | null; vote_count: number }> }> {
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
        SELECT r.id, r.request_type, r.tmdb_id, r.title, r.priority, r.status, r.status_reason, r.created_at,
           r.poster_path, r.backdrop_path, r.release_year,
          u.username, u.id as user_id,
          COALESCE(v.vote_count, 0)::int AS vote_count
    FROM media_request r
    JOIN app_user u ON u.id = r.requested_by
        LEFT JOIN (
          SELECT request_id, COUNT(*)::int AS vote_count
          FROM request_upvote
          GROUP BY request_id
        ) v ON v.request_id = r.id
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
      priority: (r.priority ?? "normal") as "low" | "normal" | "high",
      status: r.status as string,
      status_reason: (r.status_reason ?? null) as string | null,
      created_at: r.created_at as string,
      username: r.username as string,
      user_id: Number(r.user_id),
      poster_path: r.poster_path ?? null,
      backdrop_path: r.backdrop_path ?? null,
      release_year: r.release_year !== null ? Number(r.release_year) : null,
      vote_count: Number(r.vote_count ?? 0)
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
        SELECT r.id, r.request_type, r.tmdb_id, r.title, r.priority, r.status, r.status_reason, r.created_at,
          r.poster_path, r.backdrop_path, r.release_year, r.requested_by,
          COALESCE(v.vote_count, 0)::int AS vote_count,
           u.username
    FROM media_request r
    JOIN app_user u ON u.id = r.requested_by
        LEFT JOIN (
          SELECT request_id, COUNT(*)::int AS vote_count
          FROM request_upvote
          GROUP BY request_id
        ) v ON v.request_id = r.id
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
    priority: (r.priority ?? "normal") as "low" | "normal" | "high",
    status: r.status as string,
    status_reason: (r.status_reason ?? null) as string | null,
    created_at: r.created_at as string,
    poster_path: r.poster_path ?? null,
    backdrop_path: r.backdrop_path ?? null,
    release_year: r.release_year !== null ? Number(r.release_year) : null,
    user_id: r.requested_by as number,
    username: r.username as string,
    vote_count: Number(r.vote_count ?? 0)
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


export async function setEpisodeRequestItemsStatuses(
  requestId: string,
  statuses: Array<{ season: number; episode: number; status: string }>

) {
  if (!statuses.length) return;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const row of statuses) {
      await client.query(
        `
        UPDATE request_item
        SET status = $4
        WHERE request_id = $1
          AND provider = 'sonarr'
          AND season = $2
          AND episode = $3
        `,
        [requestId, row.season, row.episode, row.status]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

const EPISODE_REQUEST_STATUS_PRIORITY = [
  "available",
  "partially_available",
  "downloading",
  "submitted",
  "pending",
  "queued",
  "already_exists",
  "denied",
  "failed",
  "removed"
] as const;

function pickBetterStatus(current: string, incoming: string) {
  const a = EPISODE_REQUEST_STATUS_PRIORITY.indexOf(current as any);
  const b = EPISODE_REQUEST_STATUS_PRIORITY.indexOf(incoming as any);
  if (a === -1) return incoming;
  if (b === -1) return current;
  return b < a ? incoming : current;
}

export async function mergeDuplicateEpisodeRequests(): Promise<{ groupsMerged: number; requestsRemoved: number; itemsMerged: number }> {
  const client = await getPool().connect();
  let groupsMerged = 0;
  let requestsRemoved = 0;
  let itemsMerged = 0;

  try {
    await client.query("BEGIN");

    const duplicatesRes = await client.query(
      `
      SELECT
        tmdb_id,
        requested_by,
        array_agg(id ORDER BY created_at ASC) AS request_ids
      FROM media_request
      WHERE request_type = 'episode'
        AND status IN ('queued','pending','submitted','downloading','partially_available','available')
      GROUP BY tmdb_id, requested_by
      HAVING COUNT(*) > 1
      `
    );

    for (const row of duplicatesRes.rows) {
      const ids = Array.isArray(row.request_ids) ? row.request_ids.map((id: any) => String(id)) : [];
      if (ids.length < 2) continue;
      const canonicalId = ids[0];
      const duplicateIds = ids.slice(1);

      const requestRows = await client.query(
        `
        SELECT id, status, status_reason
        FROM media_request
        WHERE id = ANY($1::uuid[])
        `,
        [ids]
      );

      let mergedStatus = requestRows.rows.find((r: any) => String(r.id) === canonicalId)?.status ?? "submitted";
      let mergedReason = requestRows.rows.find((r: any) => String(r.id) === canonicalId)?.status_reason ?? null;
      for (const req of requestRows.rows) {
        mergedStatus = pickBetterStatus(mergedStatus, String(req.status));
        if (!mergedReason && req.status_reason) mergedReason = String(req.status_reason);
      }

      const canonicalItemsRes = await client.query(
        `
        SELECT id, provider, provider_id, season, episode, status
        FROM request_item
        WHERE request_id = $1
        `,
        [canonicalId]
      );

      const existingByKey = new Map<string, {
        id: number;
        provider: "sonarr" | "radarr";
        provider_id: number | null;
        season: number | null;
        episode: number | null;
        status: string;
      }>();

      for (const item of canonicalItemsRes.rows) {
        const key = `${item.provider}:${item.season ?? "n"}:${item.episode ?? "n"}`;
        existingByKey.set(key, {
          id: Number(item.id),
          provider: item.provider,
          provider_id: item.provider_id != null ? Number(item.provider_id) : null,
          season: item.season != null ? Number(item.season) : null,
          episode: item.episode != null ? Number(item.episode) : null,
          status: String(item.status)
        });
      }

      const duplicateItemsRes = await client.query(
        `
        SELECT provider, provider_id, season, episode, status
        FROM request_item
        WHERE request_id = ANY($1::uuid[])
        ORDER BY id ASC
        `,
        [duplicateIds]
      );

      for (const item of duplicateItemsRes.rows) {
        const provider = item.provider as "sonarr" | "radarr";
        const providerId = item.provider_id != null ? Number(item.provider_id) : null;
        const season = item.season != null ? Number(item.season) : null;
        const episode = item.episode != null ? Number(item.episode) : null;
        const status = String(item.status);
        const key = `${provider}:${season ?? "n"}:${episode ?? "n"}`;
        const existing = existingByKey.get(key);

        if (!existing) {
          await client.query(
            `
            INSERT INTO request_item (request_id, provider, provider_id, season, episode, status)
            VALUES ($1, $2, $3, $4, $5, $6)
            `,
            [canonicalId, provider, providerId, season, episode, status]
          );
          existingByKey.set(key, {
            id: 0,
            provider,
            provider_id: providerId,
            season,
            episode,
            status
          });
          itemsMerged += 1;
        } else {
          const better = pickBetterStatus(existing.status, status);
          const betterProviderId = existing.provider_id ?? providerId;
          if (better !== existing.status || betterProviderId !== existing.provider_id) {
            if (existing.id > 0) {
              await client.query(
                `UPDATE request_item SET status = $2, provider_id = $3 WHERE id = $1`,
                [existing.id, better, betterProviderId]
              );
            }
            existing.status = better;
            existing.provider_id = betterProviderId;
          }
        }
      }

      await client.query(
        `
        UPDATE media_request
        SET status = $2,
            status_reason = $3
        WHERE id = $1
        `,
        [canonicalId, mergedStatus, mergedReason]
      );

      await client.query(`DELETE FROM media_request WHERE id = ANY($1::uuid[])`, [duplicateIds]);
      groupsMerged += 1;
      requestsRemoved += duplicateIds.length;
    }

    await client.query("COMMIT");
    return { groupsMerged, requestsRemoved, itemsMerged };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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


export async function getRequestForSync(requestId: string): Promise<RequestForSync | null> {
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
    WHERE r.id = $1
      AND r.status IN ('submitted', 'downloading', 'available', 'partially_available', 'removed')
    GROUP BY r.id, u.username
    LIMIT 1
    `,
    [requestId]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
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
  };
}


export async function getRequestWithItems(requestId: string) {
  const r = await getRequestById(requestId);
  if (!r) return null;
  const items = await listRequestItems(requestId);
  return { request: r, items };
}


export async function findRequestIdByNumericId(numericId: number): Promise<string | null> {
  if (!Number.isFinite(numericId) || numericId <= 0) return null;
  const hex = Math.floor(numericId).toString(16).padStart(7, "0").slice(0, 7);
  const p = getPool();
  const res = await p.query(
    `
    SELECT id
    FROM media_request
    WHERE substring(replace(id::text, '-', '') from 1 for 7) = $1
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [hex]
  );
  return (res.rows[0]?.id as string | undefined) ?? null;
}


export async function markRequestStatus(
  requestId: string,
  status: string,
  statusReason?: string | null,
  deniedByUserId?: number | null
) {
  const p = getPool();
  const beforeRes = await p.query(`SELECT status FROM media_request WHERE id = $1 LIMIT 1`, [requestId]);
  const previousStatus = (beforeRes.rows[0]?.status as string | undefined) ?? null;
  await p.query(
    `
    UPDATE media_request
    SET
      status = $2,
      status_reason = $3,
      denied_by_user_id = CASE WHEN $2 = 'denied' THEN $4::bigint ELSE NULL::bigint END
    WHERE id = $1
    `,
    [requestId, status, statusReason ?? null, deniedByUserId ?? null]
  );

  if (previousStatus === status) return;

  if (status === "queued") {
    await logRequestLifecycleEvent({ requestId, eventType: "auto_approved" });
    return;
  }

  const eventType =
    status === "submitted"
      ? "submitted_to_service"
      : status === "downloading"
        ? "downloading"
        : status === "partially_available"
          ? "partially_available"
          : status === "available"
            ? "available"
            : status === "already_exists"
              ? "already_exists"
              : status === "denied"
                ? "denied"
                : status === "failed"
                  ? "failed"
                  : status === "removed"
                    ? "removed"
                    : null;

  if (eventType) {
    await logRequestLifecycleEvent({
      requestId,
      eventType,
      metadata: statusReason ? { reason: statusReason } : undefined,
    });
  }
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
      groups: normalizeGroupList(r.groups as string),
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


export async function deleteRequestComment(
  commentId: number,
  userId: number,
  isAdmin: boolean
): Promise<boolean> {
  const p = getPool();
  let res;
  if (isAdmin) {
    res = await p.query(
      `DELETE FROM request_comment WHERE id = $1 RETURNING id`,
      [commentId]
    );
  } else {
    res = await p.query(
      `DELETE FROM request_comment WHERE id = $1 AND user_id = $2 RETURNING id`,
      [commentId, userId]
    );
  }
  return (res.rowCount ?? 0) > 0;
}


// ==================== BULK REQUESTS ====================

export async function createBulkRequests(input: {
  userId: number;
  username: string;
  items: Array<{
    requestType: "movie" | "episode";
    tmdbId: number;
    title: string;
    posterPath?: string;
    backdropPath?: string;
    releaseYear?: number;
  }>;
}): Promise<{ created: number; skipped: number; requestIds: string[] }> {
  const p = getPool();
  const client = await p.connect();
  let created = 0;
  let skipped = 0;
  const requestIds: string[] = [];

  try {
    await client.query("BEGIN");

    for (const item of input.items) {
      // Check if active request exists
      const existing = await client.query(
        `SELECT id FROM media_request 
         WHERE tmdb_id = $1 AND request_type = $2 AND status IN ('queued', 'pending', 'submitted')`,
        [item.tmdbId, item.requestType]
      );

      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      const reqId = randomUUID();
      await client.query(
        `INSERT INTO media_request (id, request_type, tmdb_id, title, requested_by, status, poster_path, backdrop_path, release_year)
         VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8)`,
        [reqId, item.requestType, item.tmdbId, item.title, input.userId, item.posterPath, item.backdropPath, item.releaseYear]
      );

      await client.query(
        `INSERT INTO request_item (request_id, provider, status)
         VALUES ($1, $2, 'pending')`,
        [reqId, item.requestType === "movie" ? "radarr" : "sonarr"]
      );

      requestIds.push(reqId);
      created++;
    }

    await client.query("COMMIT");
    return { created, skipped, requestIds };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}


export async function bulkUpdateRequestStatus(
  requestIds: string[],
  status: string,
  statusReason?: string,
  deniedByUserId?: number
): Promise<number> {
  if (requestIds.length === 0) return 0;
  const p = getPool();

  let query = `UPDATE media_request SET status = $1, updated_at = NOW()`;
  const values: any[] = [status];
  let idx = 2;

  if (statusReason !== undefined) {
    query += `, status_reason = $${idx++}`;
    values.push(statusReason);
  }
  if (deniedByUserId !== undefined) {
    query += `, denied_by_user_id = $${idx++}`;
    values.push(deniedByUserId);
  }

  query += ` WHERE id = ANY($${idx})`;
  values.push(requestIds);

  const res = await p.query(query, values);
  return res.rowCount ?? 0;
}


export async function hasNotifiedSeason(requestId: string, season: number): Promise<boolean> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT 1 FROM notified_season WHERE request_id = $1 AND season = $2 LIMIT 1`,
    [requestId, season]
  );
  return res.rows.length > 0;
}


export async function markSeasonNotified(requestId: string, season: number): Promise<void> {
  await ensureSchema();
  const p = getPool();
  await p.query(
    `INSERT INTO notified_season (request_id, season) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [requestId, season]
  );
}


export async function setRequestPriority(
  requestId: string,
  priority: "low" | "normal" | "high"
): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE media_request SET priority = $2 WHERE id = $1`,
    [requestId, priority]
  );
  return Number(res.rowCount ?? 0) > 0;
}


export async function autoExpirePendingRequests(input: {
  olderThanDays: number;
  reason?: string;
}): Promise<Array<{
  id: string;
  request_type: "movie" | "episode";
  tmdb_id: number;
  title: string;
  username: string;
  user_id: number;
  status_reason: string;
}>> {
  const p = getPool();
  const reason = input.reason?.trim() || `Automatically expired after ${input.olderThanDays} day(s) without approval`;

  const expired = await p.query(
    `
    WITH expired AS (
      UPDATE media_request
      SET status = 'denied',
          status_reason = $2,
          denied_by_user_id = NULL
      WHERE status = 'pending'
        AND created_at < NOW() - make_interval(days => $1)
      RETURNING id, request_type, tmdb_id, title, requested_by AS user_id
    )
    SELECT e.id, e.request_type, e.tmdb_id, e.title, e.user_id, u.username, $2::text AS status_reason
    FROM expired e
    JOIN app_user u ON u.id = e.user_id
    `,
    [input.olderThanDays, reason]
  );

  const ids = expired.rows.map((r) => String(r.id));
  if (!ids.length) return [];

  await p.query(
    `UPDATE request_item SET status = 'denied' WHERE request_id = ANY($1::uuid[])`,
    [ids]
  );

  return expired.rows.map((row) => ({
    id: String(row.id),
    request_type: row.request_type as "movie" | "episode",
    tmdb_id: Number(row.tmdb_id),
    title: String(row.title),
    username: String(row.username),
    user_id: Number(row.user_id),
    status_reason: String(row.status_reason),
  }));
}


// ============================================
// Request Upvotes
// ============================================

export async function getRequestUpvote(
  requestId: string,
  userId: number
): Promise<{ count: number; voted: boolean }> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       COUNT(*)::int            AS count,
       BOOL_OR(user_id = $2)   AS voted
     FROM request_upvote
     WHERE request_id = $1`,
    [requestId, userId]
  );
  const row = res.rows[0];
  return {
    count: Number(row?.count ?? 0),
    voted: Boolean(row?.voted),
  };
}


export async function toggleRequestUpvote(
  requestId: string,
  userId: number
): Promise<{ count: number; voted: boolean }> {
  const p = getPool();
  const existing = await p.query(
    `SELECT 1 FROM request_upvote WHERE request_id = $1 AND user_id = $2`,
    [requestId, userId]
  );
  if (existing.rows.length > 0) {
    await p.query(
      `DELETE FROM request_upvote WHERE request_id = $1 AND user_id = $2`,
      [requestId, userId]
    );
  } else {
    await p.query(
      `INSERT INTO request_upvote (request_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [requestId, userId]
    );
  }
  return getRequestUpvote(requestId, userId);
}
