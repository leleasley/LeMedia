import "server-only";

import { getPool } from "@/db";

export type CustomListAccessRole = "owner" | "editor" | "viewer";
export type CustomListCollaboratorRole = "editor" | "viewer";

export interface CustomListSummary {
  id: number;
  userId: number;
  ownerUsername: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  visibility: "private" | "friends" | "public";
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
  allowComments: boolean;
  allowReactions: boolean;
  allowRemix: boolean;
  collaboratorCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomListAccessSummary extends CustomListSummary {
  accessRole: CustomListAccessRole;
  isOwner: boolean;
  canEdit: boolean;
}

export interface CustomListItem {
  id: number;
  listId: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  position: number;
  note: string | null;
  addedAt: string;
}

export interface CustomListCollaborator {
  userId: number;
  username: string;
  displayName: string | null;
  role: CustomListCollaboratorRole;
  addedAt: string;
}

const LIST_SELECT_FIELDS = `
  cl.id,
  cl.user_id as "userId",
  owner.username as "ownerUsername",
  cl.name,
  cl.description,
  cl.is_public as "isPublic",
  cl.visibility,
  cl.share_id as "shareId",
  cl.share_slug as "shareSlug",
  cl.mood,
  cl.occasion,
  cl.cover_tmdb_id as "coverTmdbId",
  cl.cover_media_type as "coverMediaType",
  cl.custom_cover_image_path as "customCoverImagePath",
  cl.custom_cover_image_size as "customCoverImageSize",
  cl.custom_cover_image_mime_type as "customCoverImageMimeType",
  cl.item_count as "itemCount",
  cl.allow_comments as "allowComments",
  cl.allow_reactions as "allowReactions",
  cl.allow_remix as "allowRemix",
  COALESCE(collab_counts.collaborator_count, 0) as "collaboratorCount",
  cl.created_at as "createdAt",
  cl.updated_at as "updatedAt"
`;

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

export async function createCustomList(input: {
  userId: number;
  name: string;
  description?: string;
  isPublic?: boolean;
  mood?: string;
  occasion?: string;
}): Promise<CustomListSummary> {
  const p = getPool();
  const shareSlug = await generateUniqueCustomListSlug(input.name);
  const isPublic = input.isPublic ?? false;
  const visibility = isPublic ? "public" : "private";
  const res = await p.query(
    `INSERT INTO custom_list (user_id, name, description, is_public, visibility, share_slug, mood, occasion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.userId,
      input.name,
      input.description || null,
      isPublic,
      visibility,
      shareSlug,
      input.mood || null,
      input.occasion || null,
    ]
  );

  return (await getCustomListAccessForUser(Number(res.rows[0].id), input.userId))!;
}

export async function getCustomListAccessForUser(
  listId: number,
  userId: number
): Promise<CustomListAccessSummary | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT ${LIST_SELECT_FIELDS},
            CASE
              WHEN cl.user_id = $2 THEN 'owner'
              ELSE COALESCE(clc.role, 'viewer')
            END as "accessRole",
            (cl.user_id = $2) as "isOwner",
            (cl.user_id = $2 OR clc.role = 'editor') as "canEdit"
       FROM custom_list cl
       INNER JOIN app_user owner ON owner.id = cl.user_id
       LEFT JOIN custom_list_collaborator clc
         ON clc.list_id = cl.id AND clc.user_id = $2
       LEFT JOIN (
         SELECT list_id, COUNT(*)::int as collaborator_count
         FROM custom_list_collaborator
         GROUP BY list_id
       ) collab_counts ON collab_counts.list_id = cl.id
      WHERE cl.id = $1
        AND (cl.user_id = $2 OR clc.user_id = $2)`,
    [listId, userId]
  );

  return res.rows[0] ?? null;
}

export async function listUserAccessibleLists(userId: number): Promise<CustomListAccessSummary[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT ${LIST_SELECT_FIELDS},
            CASE
              WHEN cl.user_id = $1 THEN 'owner'
              ELSE COALESCE(clc.role, 'viewer')
            END as "accessRole",
            (cl.user_id = $1) as "isOwner",
            (cl.user_id = $1 OR clc.role = 'editor') as "canEdit"
       FROM custom_list cl
       INNER JOIN app_user owner ON owner.id = cl.user_id
       LEFT JOIN custom_list_collaborator clc
         ON clc.list_id = cl.id AND clc.user_id = $1
       LEFT JOIN (
         SELECT list_id, COUNT(*)::int as collaborator_count
         FROM custom_list_collaborator
         GROUP BY list_id
       ) collab_counts ON collab_counts.list_id = cl.id
      WHERE cl.user_id = $1 OR clc.user_id = $1
      ORDER BY cl.updated_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function updateCustomList(
  listId: number,
  actorUserId: number,
  updates: {
    name?: string;
    description?: string;
    isPublic?: boolean;
    shareSlug?: string | null;
    mood?: string;
    occasion?: string;
  }
): Promise<CustomListAccessSummary | null> {
  const access = await getCustomListAccessForUser(listId, actorUserId);
  if (!access || !access.canEdit) {
    return null;
  }

  const p = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.shareSlug !== undefined) {
    if (!access.isOwner) {
      throw new Error("Owner privileges required");
    }
    const normalizedSlug = updates.shareSlug === null ? null : normalizeCustomListSlug(updates.shareSlug);
    if (updates.shareSlug !== null && !normalizedSlug) {
      throw new Error("Invalid share slug");
    }
    if (normalizedSlug) {
      const slugConflict = await p.query(
        `SELECT id FROM custom_list WHERE share_slug = $1 AND id <> $2 LIMIT 1`,
        [normalizedSlug, listId]
      );
      if (slugConflict.rows.length) {
        throw new Error("Share slug already in use");
      }
    }
    sets.push(`share_slug = $${idx++}`);
    values.push(normalizedSlug);
  } else if (updates.name !== undefined && access.isOwner) {
    const shareSlug = await generateUniqueCustomListSlug(updates.name, listId);
    sets.push(`share_slug = $${idx++}`);
    values.push(shareSlug);
  }

  if (updates.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    sets.push(`description = $${idx++}`);
    values.push(updates.description);
  }
  if (updates.mood !== undefined) {
    sets.push(`mood = $${idx++}`);
    values.push(updates.mood);
  }
  if (updates.occasion !== undefined) {
    sets.push(`occasion = $${idx++}`);
    values.push(updates.occasion);
  }
  if (updates.isPublic !== undefined) {
    if (!access.isOwner) {
      throw new Error("Owner privileges required");
    }
    sets.push(`is_public = $${idx++}`);
    values.push(updates.isPublic);
    sets.push(`visibility = $${idx++}`);
    values.push(updates.isPublic ? "public" : "private");
  }

  if (sets.length === 0) return access;

  sets.push(`updated_at = NOW()`);
  values.push(listId);
  await p.query(`UPDATE custom_list SET ${sets.join(", ")} WHERE id = $${idx}`, values);

  return getCustomListAccessForUser(listId, actorUserId);
}

export async function deleteCustomList(
  listId: number,
  userId: number
): Promise<{ deleted: boolean; imagePath: string | null }> {
  const access = await getCustomListAccessForUser(listId, userId);
  if (!access?.isOwner) {
    return { deleted: false, imagePath: null };
  }

  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const getRes = await client.query(
      `SELECT custom_cover_image_path FROM custom_list WHERE id = $1 AND user_id = $2`,
      [listId, userId]
    );
    const imagePath = getRes.rows[0]?.custom_cover_image_path ?? null;

    const delRes = await client.query(
      `DELETE FROM custom_list WHERE id = $1 AND user_id = $2`,
      [listId, userId]
    );

    await client.query("COMMIT");
    return { deleted: (delRes.rowCount ?? 0) > 0, imagePath };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function addCustomListItem(input: {
  listId: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  note?: string;
}): Promise<CustomListItem> {
  const p = getPool();
  const posRes = await p.query(
    `SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM custom_list_item WHERE list_id = $1`,
    [input.listId]
  );
  const nextPos = posRes.rows[0]?.next_pos ?? 0;

  const res = await p.query(
    `INSERT INTO custom_list_item (list_id, tmdb_id, media_type, position, note)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (list_id, tmdb_id, media_type) DO UPDATE SET note = EXCLUDED.note
     RETURNING id, list_id as "listId", tmdb_id as "tmdbId", media_type as "mediaType",
               position, note, added_at as "addedAt"`,
    [input.listId, input.tmdbId, input.mediaType, nextPos, input.note || null]
  );
  return res.rows[0];
}

export async function customListContainsMedia(
  listId: number,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `SELECT 1 FROM custom_list_item WHERE list_id = $1 AND tmdb_id = $2 AND media_type = $3 LIMIT 1`,
    [listId, tmdbId, mediaType]
  );
  return res.rows.length > 0;
}

export async function removeCustomListItem(
  listId: number,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `DELETE FROM custom_list_item WHERE list_id = $1 AND tmdb_id = $2 AND media_type = $3`,
    [listId, tmdbId, mediaType]
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listCustomListItems(listId: number): Promise<CustomListItem[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, list_id as "listId", tmdb_id as "tmdbId", media_type as "mediaType",
            position, note, added_at as "addedAt"
       FROM custom_list_item WHERE list_id = $1 ORDER BY position ASC`,
    [listId]
  );
  return res.rows;
}

export async function reorderCustomListItems(listId: number, itemIds: number[]): Promise<void> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < itemIds.length; i++) {
      await client.query(
        `UPDATE custom_list_item SET position = $1 WHERE id = $2 AND list_id = $3`,
        [i, itemIds[i], listId]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function setCustomListCover(
  listId: number,
  actorUserId: number,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<boolean> {
  const access = await getCustomListAccessForUser(listId, actorUserId);
  if (!access?.canEdit) return false;

  const p = getPool();
  await p.query(
    `UPDATE custom_list SET cover_tmdb_id = $1, cover_media_type = $2, updated_at = NOW()
     WHERE id = $3`,
    [tmdbId, mediaType, listId]
  );
  return true;
}

export async function setCustomListCoverImage(
  listId: number,
  actorUserId: number,
  imagePath: string,
  imageSize: number,
  mimeType: string
): Promise<boolean> {
  const access = await getCustomListAccessForUser(listId, actorUserId);
  if (!access?.canEdit) return false;

  const p = getPool();
  await p.query(
    `UPDATE custom_list SET
       custom_cover_image_path = $1,
       custom_cover_image_size = $2,
       custom_cover_image_mime_type = $3,
       cover_tmdb_id = NULL,
       cover_media_type = NULL,
       updated_at = NOW()
     WHERE id = $4`,
    [imagePath, imageSize, mimeType, listId]
  );
  return true;
}

export async function removeCustomListCoverImage(
  listId: number,
  actorUserId: number
): Promise<{ ok: boolean; imagePath: string | null }> {
  const access = await getCustomListAccessForUser(listId, actorUserId);
  if (!access?.canEdit) return { ok: false, imagePath: null };

  const p = getPool();
  const currentRes = await p.query(
    `SELECT custom_cover_image_path FROM custom_list WHERE id = $1`,
    [listId]
  );
  const imagePath = currentRes.rows[0]?.custom_cover_image_path ?? null;

  await p.query(
    `UPDATE custom_list
        SET custom_cover_image_path = NULL,
            custom_cover_image_size = NULL,
            custom_cover_image_mime_type = NULL,
            updated_at = NOW()
      WHERE id = $1`,
    [listId]
  );

  return { ok: true, imagePath };
}

export async function getListsContainingMedia(
  userId: number,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<Array<{ id: number; name: string }>> {
  const p = getPool();
  const res = await p.query(
    `SELECT DISTINCT cl.id, cl.name
       FROM custom_list cl
       LEFT JOIN custom_list_collaborator clc
         ON clc.list_id = cl.id AND clc.user_id = $1
       INNER JOIN custom_list_item cli ON cli.list_id = cl.id
      WHERE (cl.user_id = $1 OR clc.user_id = $1)
        AND cli.tmdb_id = $2
        AND cli.media_type = $3
      ORDER BY cl.name ASC`,
    [userId, tmdbId, mediaType]
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    name: row.name,
  }));
}

export async function listCustomListCollaborators(listId: number): Promise<CustomListCollaborator[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT clc.user_id as "userId",
            au.username,
            au.display_name as "displayName",
            clc.role,
            clc.created_at as "addedAt"
       FROM custom_list_collaborator clc
       INNER JOIN app_user au ON au.id = clc.user_id
      WHERE clc.list_id = $1
      ORDER BY clc.created_at ASC, au.username ASC`,
    [listId]
  );
  return res.rows;
}

export async function addCustomListCollaborator(input: {
  listId: number;
  ownerUserId: number;
  collaboratorUsername: string;
  role: CustomListCollaboratorRole;
}): Promise<CustomListCollaborator> {
  const access = await getCustomListAccessForUser(input.listId, input.ownerUserId);
  if (!access?.isOwner) {
    throw new Error("Owner privileges required");
  }

  const p = getPool();
  const userRes = await p.query(
    `SELECT id, username, display_name as "displayName"
       FROM app_user
      WHERE lower(username) = lower($1)
      LIMIT 1`,
    [input.collaboratorUsername.trim()]
  );
  const collaborator = userRes.rows[0];
  if (!collaborator) {
    throw new Error("Collaborator not found");
  }
  if (Number(collaborator.id) === input.ownerUserId) {
    throw new Error("Owner cannot be a collaborator");
  }

  await p.query(
    `INSERT INTO custom_list_collaborator (list_id, user_id, role, invited_by_user_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (list_id, user_id)
     DO UPDATE SET role = EXCLUDED.role, invited_by_user_id = EXCLUDED.invited_by_user_id`,
    [input.listId, collaborator.id, input.role, input.ownerUserId]
  );

  const collaborators = await listCustomListCollaborators(input.listId);
  const created = collaborators.find((entry) => entry.userId === Number(collaborator.id));
  if (!created) {
    throw new Error("Unable to save collaborator");
  }
  return created;
}

export async function updateCustomListCollaboratorRole(input: {
  listId: number;
  ownerUserId: number;
  collaboratorUserId: number;
  role: CustomListCollaboratorRole;
}): Promise<CustomListCollaborator | null> {
  const access = await getCustomListAccessForUser(input.listId, input.ownerUserId);
  if (!access?.isOwner) {
    throw new Error("Owner privileges required");
  }

  const p = getPool();
  const res = await p.query(
    `UPDATE custom_list_collaborator
        SET role = $1, invited_by_user_id = $2
      WHERE list_id = $3 AND user_id = $4`,
    [input.role, input.ownerUserId, input.listId, input.collaboratorUserId]
  );
  if ((res.rowCount ?? 0) === 0) {
    return null;
  }

  const collaborators = await listCustomListCollaborators(input.listId);
  return collaborators.find((entry) => entry.userId === input.collaboratorUserId) ?? null;
}

export async function removeCustomListCollaborator(input: {
  listId: number;
  ownerUserId: number;
  collaboratorUserId: number;
}): Promise<boolean> {
  const access = await getCustomListAccessForUser(input.listId, input.ownerUserId);
  if (!access?.isOwner) {
    throw new Error("Owner privileges required");
  }

  const p = getPool();
  const res = await p.query(
    `DELETE FROM custom_list_collaborator WHERE list_id = $1 AND user_id = $2`,
    [input.listId, input.collaboratorUserId]
  );
  return (res.rowCount ?? 0) > 0;
}