import { normalizeGroupList } from "@/lib/groups";
import { getPool, decryptOptionalSecret, encryptOptionalSecret, ensureSchema, ensureUserSchema } from "./core";
import type { DbUserWithHash } from "./auth";


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


export async function getUserById(id: number) {
  await ensureUserSchema();
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT
      u.id,
      u.username,
      u.display_name,
      u.email,
      u.discord_user_id,
      u.letterboxd_username,
      
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
    displayName: row.display_name ?? null,
    email: row.email,
    discordUserId: row.discord_user_id ?? null,
    letterboxdUsername: row.letterboxd_username ?? null,
    groups: normalizeGroupList(row.groups as string),
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


export async function deleteUserById(id: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`DELETE FROM app_user WHERE id = $1`, [id]);
}


export type DbUser = {
  id: number;
  username: string;
  displayName?: string | null;
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
    u.display_name,
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
    displayName: row.display_name ?? null,
    jellyfinUserId: row.jellyfin_user_id ?? null,
    jellyfinUsername: row.jellyfin_username ?? null,
    discordUserId: row.discord_user_id ?? null,
    avatarUrl: row.avatar_url ?? null,
    avatarVersion: row.avatar_version ?? null,
    email: row.email,
    groups: normalizeGroupList(row.groups as string),
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


export type AdminUserOption = {
  id: number;
  username: string;
  displayName: string | null;
};


export async function listAdminUserOptions(): Promise<AdminUserOption[]> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, display_name
    FROM app_user
    ORDER BY username ASC
    `
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    username: String(row.username),
    displayName: row.display_name ? String(row.display_name) : null,
  }));
}


export async function updateUserProfile(id: number, input: { username?: string; email?: string | null; displayName?: string | null; groups?: string[]; discordUserId?: string | null; letterboxdUsername?: string | null; traktUsername?: string | null; discoverRegion?: string | null; originalLanguage?: string | null; watchlistSyncMovies?: boolean; watchlistSyncTv?: boolean }) {
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
  if (input.displayName !== undefined) {
    clauses.push(`display_name = $${idx++}`);
    values.push(input.displayName);
  }
  if (input.groups) {
    clauses.push(`groups = $${idx++}`);
    values.push(input.groups.join(","));
  }
  if (input.discordUserId !== undefined) {
    clauses.push(`discord_user_id = $${idx++}`);
    values.push(input.discordUserId);
  }
  if (input.letterboxdUsername !== undefined) {
    clauses.push(`letterboxd_username = $${idx++}`);
    values.push(input.letterboxdUsername);
  }
  if (input.traktUsername !== undefined) {
    clauses.push(`trakt_username = $${idx++}`);
    values.push(input.traktUsername);
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


export async function listLetterboxdUsernames(limit = 50): Promise<string[]> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT DISTINCT letterboxd_username
    FROM app_user
    WHERE letterboxd_username IS NOT NULL AND letterboxd_username <> ''
    ORDER BY letterboxd_username ASC
    LIMIT $1
    `,
    [limit]
  );
  return res.rows
    .map(r => String(r.letterboxd_username).trim())
    .filter(Boolean);
}


export async function getUserByJellyfinUserId(jellyfinUserId: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
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
    display_name: row.display_name ?? null,
    groups: normalizeGroupList(row.groups as string),
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: decryptOptionalSecret(row.jellyfin_auth_token),
    letterboxd_username: row.letterboxd_username ?? null,
    discord_user_id: row.discord_user_id ?? null,
    trakt_username: row.trakt_username ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: decryptOptionalSecret(row.mfa_secret),
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
    SELECT id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
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
    display_name: row.display_name ?? null,
    groups: normalizeGroupList(row.groups as string),
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: decryptOptionalSecret(row.jellyfin_auth_token),
    letterboxd_username: row.letterboxd_username ?? null,
    discord_user_id: row.discord_user_id ?? null,
    trakt_username: row.trakt_username ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: decryptOptionalSecret(row.mfa_secret),
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
  const tokenEncrypted = encryptOptionalSecret(input.jellyfinAuthToken);
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
      tokenEncrypted,
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


export async function updateUserAvatar(input: { userId: number; avatarUrl: string | null }) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `
    UPDATE app_user
    SET avatar_url = $1,
        avatar_version = avatar_version + 1,
        last_seen_at = NOW()
    WHERE id = $2
    `,
    [input.avatarUrl ?? null, input.userId]
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
    RETURNING id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
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
    display_name: row.display_name ?? null,
    groups: normalizeGroupList(row.groups as string),
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: decryptOptionalSecret(row.jellyfin_auth_token),
    letterboxd_username: row.letterboxd_username ?? null,
    discord_user_id: row.discord_user_id ?? null,
    trakt_username: row.trakt_username ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: decryptOptionalSecret(row.mfa_secret),
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


export async function listUsersByUsernames(usernames: string[]): Promise<Array<{ id: number; username: string; displayName: string | null }>> {
  await ensureUserSchema();
  const normalized = Array.from(new Set(usernames.map((name) => name.trim().toLowerCase()).filter(Boolean)));
  if (normalized.length === 0) return [];

  const p = getPool();
  const res = await p.query(
    `SELECT id, username, display_name as "displayName"
     FROM app_user
     WHERE lower(username) = ANY($1::text[])
       AND COALESCE(banned, FALSE) = FALSE`,
    [normalized]
  );

  return res.rows.map((row) => ({
    id: Number(row.id),
    username: String(row.username),
    displayName: (row.displayName as string | null) ?? null,
  }));
}


export async function getUserByUsernameInsensitive(username: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    FROM app_user
    WHERE LOWER(username) = LOWER($1)
    LIMIT 1
    `,
    [username]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    username: row.username,
    display_name: row.display_name ?? null,
    groups: normalizeGroupList(row.groups as string),
    password_hash: row.password_hash,
    email: row.email ?? null,
    oidc_sub: row.oidc_sub ?? null,
    jellyfin_user_id: row.jellyfin_user_id ?? null,
    jellyfin_username: row.jellyfin_username ?? null,
    jellyfin_device_id: row.jellyfin_device_id ?? null,
    jellyfin_auth_token: decryptOptionalSecret(row.jellyfin_auth_token),
    letterboxd_username: row.letterboxd_username ?? null,
    discord_user_id: row.discord_user_id ?? null,
    trakt_username: row.trakt_username ?? null,
    avatar_url: row.avatar_url ?? null,
    avatar_version: row.avatar_version ?? null,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    mfa_secret: decryptOptionalSecret(row.mfa_secret),
    discover_region: row.discover_region ?? null,
    original_language: row.original_language ?? null,
    watchlist_sync_movies: !!row.watchlist_sync_movies,
    watchlist_sync_tv: !!row.watchlist_sync_tv,
    request_limit_movie: row.request_limit_movie ?? null,
    request_limit_movie_days: row.request_limit_movie_days ?? null,
    request_limit_series: row.request_limit_series ?? null,
    request_limit_series_days: row.request_limit_series_days ?? null,
    banned: !!row.banned,
    weekly_digest_opt_in: !!row.weekly_digest_opt_in
  };
}
