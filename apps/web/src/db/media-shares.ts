import { getPool } from "./core";

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
