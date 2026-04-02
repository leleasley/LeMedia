import { getPool } from "./core";


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
