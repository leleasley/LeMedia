import { getPool } from "./core";


// ==================== CUSTOM LISTS ====================

export interface CustomList {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  isPublic: boolean;
  shareId: string;
  shareSlug: string | null;
  mood: string | null;
  occasion: string | null;
  coverTmdbId: number | null;
  coverMediaType: "movie" | "tv" | null;
  customCoverImagePath: string | null;
  customCoverImageSize: number | null;
  customCoverImageMimeType: string | null;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}


export async function getCustomListById(listId: number): Promise<CustomList | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id as "userId", name, description, is_public as "isPublic",
          share_id as "shareId", share_slug as "shareSlug", mood, occasion,
          cover_tmdb_id as "coverTmdbId",
          cover_media_type as "coverMediaType",
          custom_cover_image_path as "customCoverImagePath",
          custom_cover_image_size as "customCoverImageSize",
          custom_cover_image_mime_type as "customCoverImageMimeType",
          item_count as "itemCount",
          created_at as "createdAt", updated_at as "updatedAt"
     FROM custom_list WHERE id = $1`,
    [listId]
  );
  const row = res.rows[0] || null;
  if (row && !row.shareSlug) {
    const shareSlug = await generateUniqueCustomListSlug(row.name, row.id);
    await p.query(`UPDATE custom_list SET share_slug = $1 WHERE id = $2`, [shareSlug, row.id]);
    row.shareSlug = shareSlug;
  }
  return row;
}


export async function getCustomListByShareId(shareIdOrSlug: string): Promise<CustomList | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id as "userId", name, description, is_public as "isPublic",
          share_id as "shareId", share_slug as "shareSlug", mood, occasion,
          cover_tmdb_id as "coverTmdbId",
          cover_media_type as "coverMediaType",
          custom_cover_image_path as "customCoverImagePath",
          custom_cover_image_size as "customCoverImageSize",
          custom_cover_image_mime_type as "customCoverImageMimeType",
          item_count as "itemCount",
          created_at as "createdAt", updated_at as "updatedAt"
     FROM custom_list
     WHERE (share_id::text = $1 OR share_slug = $1)
       AND (is_public = TRUE OR visibility = 'public')`,
    [shareIdOrSlug]
  );
  const row = res.rows[0] || null;
  if (row && !row.shareSlug) {
    const shareSlug = await generateUniqueCustomListSlug(row.name, row.id);
    await p.query(`UPDATE custom_list SET share_slug = $1 WHERE id = $2`, [shareSlug, row.id]);
    row.shareSlug = shareSlug;
  }
  return row;
}


export async function listUserCustomLists(userId: number): Promise<CustomList[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id as "userId", name, description, is_public as "isPublic",
          share_id as "shareId", share_slug as "shareSlug", mood, occasion,
          cover_tmdb_id as "coverTmdbId",
          cover_media_type as "coverMediaType",
          custom_cover_image_path as "customCoverImagePath",
          custom_cover_image_size as "customCoverImageSize",
          custom_cover_image_mime_type as "customCoverImageMimeType",
          item_count as "itemCount",
          created_at as "createdAt", updated_at as "updatedAt"
     FROM custom_list WHERE user_id = $1 ORDER BY updated_at DESC`,
    [userId]
  );
  return res.rows;
}


function slugifyCustomListName(name: string): string {
  const trimmed = name.trim().toLowerCase();
  const slug = trimmed
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "list";
}

function normalizeCustomListSlug(input: string): string {
  const trimmed = input.trim().toLowerCase();
  return trimmed.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

async function generateUniqueCustomListSlug(name: string, listId?: number): Promise<string> {
  const base = slugifyCustomListName(name);
  const p = getPool();
  let candidate = base;
  let suffix = 2;

  while (true) {
    const res = await p.query(
      `SELECT id FROM custom_list WHERE share_slug = $1 ${listId ? "AND id <> $2" : ""} LIMIT 1`,
      listId ? [candidate, listId] : [candidate]
    );
    if (!res.rows.length) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}
