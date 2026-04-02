import { getPool, ensureSchema } from "./core";


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
