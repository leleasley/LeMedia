import { createHash, randomBytes, randomUUID } from "crypto";
import { normalizeGroupList } from "@/lib/groups";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { hashUserApiToken } from "@/lib/api-tokens";
import { getPool, decryptOptionalSecret, encryptOptionalSecret, ensureUserSchema, ensureMediaListSchema } from "./core";


export type DbUserWithHash = {
  id: number;
  username: string;
  display_name: string | null;
  groups: string[];
  password_hash: string | null;
  email: string | null;
  oidc_sub: string | null;
  jellyfin_user_id: string | null;
  jellyfin_username: string | null;
  jellyfin_device_id: string | null;
  jellyfin_auth_token: string | null;
  letterboxd_username: string | null;
  discord_user_id: string | null;
  trakt_username: string | null;
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


export async function getUserWithHash(username: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
  SELECT id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
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


export type UserApiTokenRecord = {
  id: number;
  name: string;
  createdAt: string | null;
  updatedAt: string | null;
};


export async function getUserApiTokenById(userId: number, tokenId: number): Promise<{ id: number; name: string; token: string; createdAt: string | null; updatedAt: string | null } | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT id, name, token_encrypted, created_at, updated_at
     FROM user_api_token_v2
     WHERE user_id = $1 AND id = $2
     LIMIT 1`,
    [userId, tokenId]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  const raw = row.token_encrypted as string;
  let token = raw;
  try {
    token = decryptSecret(raw);
  } catch {
    // stored as plain text
  }
  return {
    id: Number(row.id),
    name: row.name as string,
    token,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}


export async function listUserApiTokens(userId: number): Promise<UserApiTokenRecord[]> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT id, name, created_at, updated_at
     FROM user_api_token_v2
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows.map(row => ({
    id: Number(row.id),
    name: row.name as string,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  }));
}


export async function getUserApiToken(userId: number): Promise<{ token: string; createdAt: string | null; updatedAt: string | null } | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT token_encrypted, created_at, updated_at
     FROM user_api_token_v2
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  const raw = row.token_encrypted as string;
  let token = raw;
  try {
    token = decryptSecret(raw);
  } catch {
    // stored as plain text
  }
  return {
    token,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null
  };
}


export async function createUserApiToken(userId: number, name: string, token: string): Promise<{ id: number; name: string; token: string; createdAt: string | null; updatedAt: string | null }> {
  await ensureUserSchema();
  const p = getPool();
  const tokenHash = hashUserApiToken(token);
  const tokenEncrypted = encryptSecret(token);
  const res = await p.query(
    `
    INSERT INTO user_api_token_v2 (user_id, name, token_hash, token_encrypted, created_at, updated_at)
    VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING id, created_at, updated_at
    `,
    [userId, name, tokenHash, tokenEncrypted]
  );
  const row = res.rows[0];
  return {
    id: Number(row.id),
    name,
    token,
    createdAt: row?.created_at ?? null,
    updatedAt: row?.updated_at ?? null
  };
}


export async function revokeUserApiToken(userId: number): Promise<boolean> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(`DELETE FROM user_api_token_v2 WHERE user_id = $1`, [userId]);
  return Number(res.rowCount ?? 0) > 0;
}


export async function revokeUserApiTokenById(userId: number, tokenId: number): Promise<boolean> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(`DELETE FROM user_api_token_v2 WHERE id = $1 AND user_id = $2`, [tokenId, userId]);
  return Number(res.rowCount ?? 0) > 0;
}


export async function findUserIdByApiToken(token: string): Promise<number | null> {
  await ensureUserSchema();
  const p = getPool();
  const tokenHash = hashUserApiToken(token);
  const res = await p.query(`SELECT user_id FROM user_api_token_v2 WHERE token_hash = $1 LIMIT 1`, [tokenHash]);
  if (res.rows.length) return Number(res.rows[0].user_id);

  const legacy = await p.query(`SELECT user_id FROM user_api_token WHERE token_hash = $1 LIMIT 1`, [tokenHash]);
  if (!legacy.rows.length) return null;
  return Number(legacy.rows[0].user_id);
}


export async function getUserTraktTokenStatus(userId: number): Promise<{ linked: boolean; expiresAt: string | null }> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT expires_at FROM user_trakt_token WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  if (!res.rows[0]) return { linked: false, expiresAt: null };
  return { linked: true, expiresAt: res.rows[0].expires_at as string | null };
}


export async function getUserTraktToken(userId: number): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scope: string | null;
} | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT access_token_encrypted, refresh_token_encrypted, expires_at, scope
     FROM user_trakt_token
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  if (!res.rows[0]) return null;
  const row = res.rows[0];
  let accessToken = row.access_token_encrypted as string;
  let refreshToken = row.refresh_token_encrypted as string;
  try {
    accessToken = decryptSecret(accessToken);
  } catch {
    // ignore
  }
  try {
    refreshToken = decryptSecret(refreshToken);
  } catch {
    // ignore
  }
  return {
    accessToken,
    refreshToken,
    expiresAt: row.expires_at as string | null,
    scope: row.scope as string | null
  };
}


export async function upsertUserTraktToken(input: {
  userId: number;
  accessToken: string;
  refreshToken: string;
  expiresAt: string | null;
  scope?: string | null;
}): Promise<void> {
  await ensureUserSchema();
  const p = getPool();
  const accessEncrypted = encryptSecret(input.accessToken);
  const refreshEncrypted = encryptSecret(input.refreshToken);
  await p.query(
    `INSERT INTO user_trakt_token (
        user_id,
        access_token_encrypted,
        refresh_token_encrypted,
        expires_at,
        scope
     )
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id)
     DO UPDATE SET
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
        expires_at = EXCLUDED.expires_at,
        scope = EXCLUDED.scope,
        updated_at = NOW()`,
    [input.userId, accessEncrypted, refreshEncrypted, input.expiresAt, input.scope ?? null]
  );
}


export async function deleteUserTraktToken(userId: number): Promise<void> {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`DELETE FROM user_trakt_token WHERE user_id = $1`, [userId]);
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
    RETURNING id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    `,
    [username, groups.join(","), passwordHash, email ?? null]
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


export async function getUserWithHashById(id: number): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    FROM app_user
    WHERE id = $1
    LIMIT 1
    `,
    [id]
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


export async function addUserPasswordHistory(userId: number, passwordHash: string): Promise<void> {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO user_password_history (user_id, password_hash, created_at)
    VALUES ($1, $2, NOW())
    `,
    [userId, passwordHash]
  );
}


export async function createPasswordResetToken(userId: number): Promise<string> {
  await ensureUserSchema();
  const p = getPool();
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  // Invalidate any existing unused tokens for this user before creating a new one.
  await p.query(
    `DELETE FROM password_reset_token WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );

  await p.query(
    `
    INSERT INTO password_reset_token (user_id, token_hash, expires_at)
    VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
    `,
    [userId, tokenHash]
  );

  return token;
}


export async function exchangePasswordResetToken(token: string): Promise<string | null> {
  await ensureUserSchema();
  const p = getPool();
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const res = await p.query(
    `
    UPDATE password_reset_token t
    SET viewed_at = NOW()
    FROM app_user u
    WHERE t.token_hash = $1
      AND t.user_id = u.id
      AND t.used_at IS NULL
      AND t.viewed_at IS NULL
      AND t.expires_at > NOW()
    RETURNING u.username
    `,
    [tokenHash]
  );

  return res.rows.length > 0 ? (res.rows[0].username as string) : null;
}


export async function consumePasswordResetToken(token: string): Promise<number | null> {
  await ensureUserSchema();
  const p = getPool();
  const tokenHash = createHash("sha256").update(token).digest("hex");

  const res = await p.query(
    `
    UPDATE password_reset_token
    SET used_at = NOW()
    WHERE token_hash = $1
      AND used_at IS NULL
      AND expires_at > NOW()
    RETURNING user_id
    `,
    [tokenHash]
  );

  if (!res.rows.length) return null;
  return Number(res.rows[0].user_id);
}


export async function getUserPasswordHistory(userId: number): Promise<string[]> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT password_hash
    FROM user_password_history
    WHERE user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );
  return res.rows.map(row => row.password_hash as string);
}


export type MfaSessionType = "verify" | "setup";

export type OAuthProvider = "google" | "github" | "telegram";


export type UserOAuthAccount = {
  provider: OAuthProvider;
  providerUserId: string;
  providerEmail: string | null;
  providerLogin: string | null;
  linkedAt: string;
  updatedAt: string;
};


export type MfaSessionRecord = {
  id: string;
  user_id: number;
  type: MfaSessionType;
  secret: string | null;
  expires_at: string;
};


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


export async function getUserByOidcSub(oidcSub: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
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


export async function getUserByEmail(email: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
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


export async function getUserByUsername(username: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
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
    RETURNING id, username, display_name, groups, password_hash, email, oidc_sub, jellyfin_user_id, jellyfin_username, jellyfin_device_id, jellyfin_auth_token, letterboxd_username, discord_user_id, trakt_username, avatar_url, avatar_version, created_at, last_seen_at, mfa_secret, discover_region, original_language, watchlist_sync_movies, watchlist_sync_tv, request_limit_movie, request_limit_movie_days, request_limit_series, request_limit_series_days, banned, weekly_digest_opt_in
    `,
    [input.username, input.groups.join(","), input.email ?? null, input.oidcSub]
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


export async function listUserOAuthAccounts(userId: number): Promise<UserOAuthAccount[]> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT provider, provider_user_id, provider_email, provider_login, linked_at, updated_at
    FROM user_oauth_account
    WHERE user_id = $1
    ORDER BY linked_at DESC
    `,
    [userId]
  );
  return res.rows.map((row) => ({
    provider: row.provider as OAuthProvider,
    providerUserId: row.provider_user_id,
    providerEmail: row.provider_email ?? null,
    providerLogin: row.provider_login ?? null,
    linkedAt: row.linked_at,
    updatedAt: row.updated_at
  }));
}


export async function getUserOAuthAccount(userId: number, provider: OAuthProvider): Promise<UserOAuthAccount | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT provider, provider_user_id, provider_email, provider_login, linked_at, updated_at
    FROM user_oauth_account
    WHERE user_id = $1 AND provider = $2
    LIMIT 1
    `,
    [userId, provider]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    provider: row.provider as OAuthProvider,
    providerUserId: row.provider_user_id,
    providerEmail: row.provider_email ?? null,
    providerLogin: row.provider_login ?? null,
    linkedAt: row.linked_at,
    updatedAt: row.updated_at
  };
}


export async function getUserByOAuthAccount(provider: OAuthProvider, providerUserId: string): Promise<DbUserWithHash | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT user_id
    FROM user_oauth_account
    WHERE provider = $1 AND provider_user_id = $2
    LIMIT 1
    `,
    [provider, providerUserId]
  );
  if (!res.rows.length) return null;
  return getUserWithHashById(Number(res.rows[0].user_id));
}


export async function upsertUserOAuthAccount(input: {
  userId: number;
  provider: OAuthProvider;
  providerUserId: string;
  providerEmail?: string | null;
  providerLogin?: string | null;
}) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO user_oauth_account (user_id, provider, provider_user_id, provider_email, provider_login, linked_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
    ON CONFLICT (user_id, provider)
    DO UPDATE
      SET provider_user_id = EXCLUDED.provider_user_id,
          provider_email = EXCLUDED.provider_email,
          provider_login = EXCLUDED.provider_login,
          updated_at = NOW()
    `,
    [input.userId, input.provider, input.providerUserId, input.providerEmail ?? null, input.providerLogin ?? null]
  );
}


export async function unlinkUserOAuthAccount(userId: number, provider: OAuthProvider) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `
    DELETE FROM user_oauth_account
    WHERE user_id = $1 AND provider = $2
    `,
    [userId, provider]
  );
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
  return decryptOptionalSecret(res.rows[0].mfa_secret ?? null);
}


export async function setUserMfaSecretById(userId: number, secret: string) {
  await ensureUserSchema();
  const p = getPool();
  const encrypted = encryptOptionalSecret(secret);
  await p.query(`UPDATE app_user SET mfa_secret = $1, last_seen_at = NOW() WHERE id = $2`, [encrypted, userId]);
}


export async function resetUserMfaById(userId: number) {
  await ensureUserSchema();
  const p = getPool();
  await p.query(`UPDATE app_user SET mfa_secret = NULL, last_seen_at = NOW() WHERE id = $1`, [userId]);
  await deleteMfaSessionsForUser(userId);
}
