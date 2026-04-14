import { ensureUserMediaPreferenceSchema, getPool } from "./core";

export type TvTrailerPreference = "series" | "latest-season" | "best-available";

export async function getUserTvTrailerPreference(userId: number): Promise<TvTrailerPreference> {
  await ensureUserMediaPreferenceSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT tv_trailer_preference
       FROM user_media_preference
      WHERE user_id = $1
      LIMIT 1`,
    [userId]
  );
  const value = String(res.rows[0]?.tv_trailer_preference ?? "series");
  return value === "latest-season" || value === "best-available" ? value : "series";
}

export async function setUserTvTrailerPreference(
  userId: number,
  preference: TvTrailerPreference
): Promise<TvTrailerPreference> {
  await ensureUserMediaPreferenceSchema();
  const p = getPool();
  const res = await p.query(
    `INSERT INTO user_media_preference (user_id, tv_trailer_preference, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET tv_trailer_preference = EXCLUDED.tv_trailer_preference, updated_at = NOW()
     RETURNING tv_trailer_preference`,
    [userId, preference]
  );
  const value = String(res.rows[0]?.tv_trailer_preference ?? preference);
  return value === "latest-season" || value === "best-available" ? value : "series";
}