import { normalizeGroupList } from "@/lib/groups";
import { getPool } from "./core";


// ============================================
// User Reviews
// ============================================

export async function upsertUserReview(input: {
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  rating: number;
  reviewText?: string | null;
  spoiler: boolean;
  title: string;
  posterPath?: string | null;
  releaseYear?: number | null;
}) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO user_review (
        user_id,
        media_type,
        tmdb_id,
        rating,
        review_text,
        spoiler,
        title,
        poster_path,
        release_year
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (user_id, media_type, tmdb_id)
     DO UPDATE SET
        rating = EXCLUDED.rating,
        review_text = EXCLUDED.review_text,
        spoiler = EXCLUDED.spoiler,
        title = EXCLUDED.title,
        poster_path = EXCLUDED.poster_path,
        release_year = EXCLUDED.release_year,
        updated_at = NOW()
     RETURNING id, created_at, updated_at`,
    [
      input.userId,
      input.mediaType,
      input.tmdbId,
      input.rating,
      input.reviewText ?? null,
      input.spoiler,
      input.title,
      input.posterPath ?? null,
      input.releaseYear ?? null,
    ]
  );
  return {
    id: res.rows[0].id as number,
    createdAt: res.rows[0].created_at as string,
    updatedAt: res.rows[0].updated_at as string,
  };
}


export async function getUserReviewForMedia(userId: number, mediaType: "movie" | "tv", tmdbId: number) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, rating, review_text, spoiler, created_at, updated_at
     FROM user_review
     WHERE user_id = $1 AND media_type = $2 AND tmdb_id = $3`,
    [userId, mediaType, tmdbId]
  );
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return {
    id: r.id as number,
    rating: r.rating as number,
    reviewText: r.review_text as string | null,
    spoiler: r.spoiler as boolean,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}


export async function getReviewStatsForMedia(mediaType: "movie" | "tv", tmdbId: number) {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*)::int as count, COALESCE(AVG(rating), 0) as avg
     FROM user_review
     WHERE media_type = $1 AND tmdb_id = $2`,
    [mediaType, tmdbId]
  );
  const row = res.rows[0];
  return {
    total: row?.count ? Number(row.count) : 0,
    average: row?.avg ? Number(row.avg) : 0,
  };
}


export async function listUserReviewsForUser(input: {
  userId: number;
  minRating?: number;
  limit?: number;
}) {
  const p = getPool();
  const minRating = Math.min(Math.max(input.minRating ?? 4, 1), 5);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 200);
  const res = await p.query(
    `SELECT media_type, tmdb_id, rating, created_at
     FROM user_review
     WHERE user_id = $1 AND rating >= $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [input.userId, minRating, limit]
  );
  return res.rows.map(r => ({
    mediaType: r.media_type as "movie" | "tv",
    tmdbId: r.tmdb_id as number,
    rating: r.rating as number,
    createdAt: r.created_at as string
  }));
}


export async function getRecentReviewsByUser(userId: number, limit = 10) {
  const p = getPool();
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const res = await p.query(
    `SELECT
        r.id,
        r.user_id,
        r.media_type,
        r.tmdb_id,
        r.rating,
        r.review_text,
        r.spoiler,
        r.title,
        r.poster_path,
        r.release_year,
        r.created_at,
        r.updated_at,
        u.username,
        u.display_name,
        u.avatar_url,
        u.jellyfin_user_id,
        u.groups
     FROM user_review r
     JOIN app_user u ON r.user_id = u.id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2`,
    [userId, safeLimit]
  );

  return res.rows.map(r => ({
    id: r.id as number,
    userId: r.user_id as number,
    mediaType: r.media_type as "movie" | "tv",
    tmdbId: r.tmdb_id as number,
    rating: r.rating as number,
    reviewText: r.review_text as string | null,
    spoiler: r.spoiler as boolean,
    title: r.title as string,
    posterPath: r.poster_path as string | null,
    releaseYear: r.release_year as number | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    user: {
      id: r.user_id as number,
      username: r.username as string,
      displayName: r.display_name as string | null,
      avatarUrl: r.avatar_url as string | null,
      jellyfinUserId: r.jellyfin_user_id as string | null,
      groups: normalizeGroupList(r.groups as string),
    },
  }));
}


export async function getReviewsForMedia(mediaType: "movie" | "tv", tmdbId: number, limit = 50) {
  const p = getPool();
  const res = await p.query(
    `SELECT
        r.id,
        r.user_id,
        r.media_type,
        r.tmdb_id,
        r.rating,
        r.review_text,
        r.spoiler,
        r.title,
        r.poster_path,
        r.release_year,
        r.created_at,
        r.updated_at,
        u.username,
        u.display_name,
        u.avatar_url,
        u.jellyfin_user_id,
        u.groups
     FROM user_review r
     JOIN app_user u ON r.user_id = u.id
     WHERE r.media_type = $1 AND r.tmdb_id = $2
     ORDER BY r.created_at DESC
     LIMIT $3`,
    [mediaType, tmdbId, limit]
  );
  return res.rows.map(r => ({
    id: r.id as number,
    userId: r.user_id as number,
    mediaType: r.media_type as "movie" | "tv",
    tmdbId: r.tmdb_id as number,
    rating: r.rating as number,
    reviewText: r.review_text as string | null,
    spoiler: r.spoiler as boolean,
    title: r.title as string,
    posterPath: r.poster_path as string | null,
    releaseYear: r.release_year as number | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    user: {
      id: r.user_id as number,
      username: r.username as string,
      displayName: r.display_name as string | null,
      avatarUrl: r.avatar_url as string | null,
      jellyfinUserId: r.jellyfin_user_id as string | null,
      groups: normalizeGroupList(r.groups as string),
    },
  }));
}


export async function getRecentReviews(limit = 20) {
  const p = getPool();
  const res = await p.query(
    `SELECT
        r.id,
        r.user_id,
        r.media_type,
        r.tmdb_id,
        r.rating,
        r.review_text,
        r.spoiler,
        r.title,
        r.poster_path,
        r.release_year,
        r.created_at,
        r.updated_at,
        u.username,
        u.avatar_url,
        u.groups
     FROM user_review r
     JOIN app_user u ON r.user_id = u.id
     ORDER BY r.created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows.map(r => ({
    id: r.id as number,
    userId: r.user_id as number,
    mediaType: r.media_type as "movie" | "tv",
    tmdbId: r.tmdb_id as number,
    rating: r.rating as number,
    reviewText: r.review_text as string | null,
    spoiler: r.spoiler as boolean,
    title: r.title as string,
    posterPath: r.poster_path as string | null,
    releaseYear: r.release_year as number | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    user: {
      id: r.user_id as number,
      username: r.username as string,
      avatarUrl: r.avatar_url as string | null,
      groups: normalizeGroupList(r.groups as string),
    },
  }));
}


export async function deleteUserReview(id: number, userId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `DELETE FROM user_review WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (res.rowCount ?? 0) > 0;
}


export type ReviewComment = {
  id: number;
  reviewId: number;
  userId: number;
  parentId: number | null;
  content: string;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    avatarVersion: number | null;
    jellyfinUserId: string | null;
  };
  replyCount: number;
};


export async function getReviewById(reviewId: number): Promise<{
  id: number;
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  reviewerUsername: string;
} | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT r.id, r.user_id as "userId", r.media_type as "mediaType", r.tmdb_id as "tmdbId", r.title,
            u.username as "reviewerUsername"
     FROM user_review r
     JOIN app_user u ON u.id = r.user_id
     WHERE r.id = $1
     LIMIT 1`,
    [reviewId]
  );
  return (res.rows[0] as {
    id: number;
    userId: number;
    mediaType: "movie" | "tv";
    tmdbId: number;
    title: string;
    reviewerUsername: string;
  } | undefined) ?? null;
}


export async function getReviewCommentById(commentId: number): Promise<{ id: number; reviewId: number; userId: number } | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, review_id as "reviewId", user_id as "userId"
     FROM review_comment
     WHERE id = $1
     LIMIT 1`,
    [commentId]
  );
  return (res.rows[0] as { id: number; reviewId: number; userId: number } | undefined) ?? null;
}


export async function addReviewComment(reviewId: number, userId: number, content: string, parentId?: number): Promise<ReviewComment> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO review_comment (review_id, user_id, content, parent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING
       id,
       review_id as "reviewId",
       user_id as "userId",
       parent_id as "parentId",
       content,
       edited,
       created_at as "createdAt",
       updated_at as "updatedAt"`,
    [reviewId, userId, content, parentId ?? null]
  );

  const userRes = await p.query(
    `SELECT id, username, display_name as "displayName", avatar_url as "avatarUrl",
            avatar_version as "avatarVersion", jellyfin_user_id as "jellyfinUserId"
     FROM app_user
     WHERE id = $1`,
    [userId]
  );

  const row = res.rows[0];
  const user = userRes.rows[0];
  return {
    id: Number(row.id),
    reviewId: Number(row.reviewId),
    userId: Number(row.userId),
    parentId: row.parentId === null ? null : Number(row.parentId),
    content: String(row.content),
    edited: !!row.edited,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    user: {
      id: Number(user.id),
      username: String(user.username),
      displayName: (user.displayName as string | null) ?? null,
      avatarUrl: (user.avatarUrl as string | null) ?? null,
      avatarVersion: user.avatarVersion == null ? null : Number(user.avatarVersion),
      jellyfinUserId: (user.jellyfinUserId as string | null) ?? null,
    },
    replyCount: 0,
  };
}


export async function updateReviewComment(reviewId: number, commentId: number, userId: number, content: string): Promise<ReviewComment | null> {
  const p = getPool();
  const res = await p.query(
    `UPDATE review_comment
     SET content = $1, edited = TRUE, updated_at = NOW()
     WHERE review_id = $2 AND id = $3 AND user_id = $4
     RETURNING
       id,
       review_id as "reviewId",
       user_id as "userId",
       parent_id as "parentId",
       content,
       edited,
       created_at as "createdAt",
       updated_at as "updatedAt"`,
    [content, reviewId, commentId, userId]
  );
  if (!res.rows.length) return null;

  const userRes = await p.query(
    `SELECT id, username, display_name as "displayName", avatar_url as "avatarUrl",
            avatar_version as "avatarVersion", jellyfin_user_id as "jellyfinUserId"
     FROM app_user
     WHERE id = $1`,
    [userId]
  );

  const row = res.rows[0];
  const user = userRes.rows[0];
  return {
    id: Number(row.id),
    reviewId: Number(row.reviewId),
    userId: Number(row.userId),
    parentId: row.parentId === null ? null : Number(row.parentId),
    content: String(row.content),
    edited: !!row.edited,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    user: {
      id: Number(user.id),
      username: String(user.username),
      displayName: (user.displayName as string | null) ?? null,
      avatarUrl: (user.avatarUrl as string | null) ?? null,
      avatarVersion: user.avatarVersion == null ? null : Number(user.avatarVersion),
      jellyfinUserId: (user.jellyfinUserId as string | null) ?? null,
    },
    replyCount: 0,
  };
}


export async function deleteReviewComment(reviewId: number, commentId: number, userId: number, isAdmin = false): Promise<boolean> {
  const p = getPool();
  const res = isAdmin
    ? await p.query(`DELETE FROM review_comment WHERE review_id = $1 AND id = $2`, [reviewId, commentId])
    : await p.query(`DELETE FROM review_comment WHERE review_id = $1 AND id = $2 AND user_id = $3`, [reviewId, commentId, userId]);
  return (res.rowCount ?? 0) > 0;
}


export async function getReviewComments(reviewId: number, parentId: number | null = null, limit = 100, offset = 0): Promise<ReviewComment[]> {
  const p = getPool();
  const boundedLimit = Math.min(Math.max(limit, 1), 200);
  const boundedOffset = Math.max(offset, 0);
  const params: Array<number | null> = [reviewId, boundedLimit, boundedOffset];
  let parentClause = "";

  if (parentId === null) {
    parentClause = "";
  } else {
    params.push(parentId);
    parentClause = `AND rc.parent_id = $4`;
  }

  const res = await p.query(
    `SELECT
       rc.id,
       rc.review_id as "reviewId",
       rc.user_id as "userId",
       rc.parent_id as "parentId",
       rc.content,
       rc.edited,
       rc.created_at as "createdAt",
       rc.updated_at as "updatedAt",
       u.id as "authorId",
       u.username,
       u.display_name as "displayName",
       u.avatar_url as "avatarUrl",
       u.avatar_version as "avatarVersion",
       u.jellyfin_user_id as "jellyfinUserId",
       (SELECT COUNT(*) FROM review_comment c WHERE c.parent_id = rc.id)::int as "replyCount"
     FROM review_comment rc
     JOIN app_user u ON u.id = rc.user_id
     WHERE rc.review_id = $1
       ${parentClause}
     ORDER BY rc.created_at ASC
     LIMIT $2 OFFSET $3`,
    params
  );

  return res.rows.map((row) => ({
    id: Number(row.id),
    reviewId: Number(row.reviewId),
    userId: Number(row.userId),
    parentId: row.parentId === null ? null : Number(row.parentId),
    content: String(row.content),
    edited: !!row.edited,
    createdAt: String(row.createdAt),
    updatedAt: String(row.updatedAt),
    user: {
      id: Number(row.authorId),
      username: String(row.username),
      displayName: (row.displayName as string | null) ?? null,
      avatarUrl: (row.avatarUrl as string | null) ?? null,
      avatarVersion: row.avatarVersion == null ? null : Number(row.avatarVersion),
      jellyfinUserId: (row.jellyfinUserId as string | null) ?? null,
    },
    replyCount: Number(row.replyCount ?? 0),
  }));
}


export async function getReviewCommentCount(reviewId: number): Promise<number> {
  const p = getPool();
  const res = await p.query(`SELECT COUNT(*)::int as count FROM review_comment WHERE review_id = $1`, [reviewId]);
  return Number(res.rows[0]?.count ?? 0);
}


export async function addReviewCommentMentions(commentId: number, mentionedUserIds: number[]): Promise<void> {
  const ids = Array.from(new Set(mentionedUserIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return;
  const p = getPool();
  await p.query(
    `INSERT INTO review_comment_mention (comment_id, mentioned_user_id)
     SELECT $1, unnest($2::bigint[])
     ON CONFLICT (comment_id, mentioned_user_id) DO NOTHING`,
    [commentId, ids]
  );
}
