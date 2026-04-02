import { getPool, ensureMediaListSchema } from "./core";


export type UserMediaListType = "favorite" | "watchlist" | "watched";


export type UserMediaListItem = {
  user_id: number;
  list_type: UserMediaListType;
  media_type: "movie" | "tv";
  tmdb_id: number;
  created_at: string;
};


export async function addUserMediaListItem(input: {
  userId: number;
  listType: UserMediaListType;
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO user_media_list (user_id, list_type, media_type, tmdb_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT DO NOTHING
    `,
    [input.userId, input.listType, input.mediaType, input.tmdbId]
  );
}


export async function removeUserMediaListItem(input: {
  userId: number;
  listType: UserMediaListType;
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  await p.query(
    `
    DELETE FROM user_media_list
    WHERE user_id = $1 AND list_type = $2 AND media_type = $3 AND tmdb_id = $4
    `,
    [input.userId, input.listType, input.mediaType, input.tmdbId]
  );
}


export async function listUserMediaList(input: {
  userId: number;
  listType: UserMediaListType;
  limit?: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const res = await p.query(
    `
    SELECT user_id, list_type, media_type, tmdb_id, created_at
    FROM user_media_list
    WHERE user_id = $1 AND list_type = $2
    ORDER BY created_at DESC
    LIMIT $3
    `,
    [input.userId, input.listType, limit]
  );
  return res.rows as UserMediaListItem[];
}


export async function getUserMediaListStatus(input: {
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT list_type
    FROM user_media_list
    WHERE user_id = $1 AND media_type = $2 AND tmdb_id = $3
    `,
    [input.userId, input.mediaType, input.tmdbId]
  );
  const types = new Set(res.rows.map(row => row.list_type as UserMediaListType));
  return {
    favorite: types.has("favorite"),
    watchlist: types.has("watchlist"),
    watched: types.has("watched")
  };
}


export async function getUserMediaListStatusBulk(input: {
  userId: number;
  items: Array<{ mediaType: "movie" | "tv"; tmdbId: number }>;
}) {
  await ensureMediaListSchema();
  if (!input.items.length) return new Map<string, { favorite: boolean; watchlist: boolean; watched: boolean }>();
  const p = getPool();
  const values: any[] = [input.userId];
  const tuples = input.items.map((item, index) => {
    const base = index * 2 + 2;
    values.push(item.mediaType, item.tmdbId);
    return `($${base}, $${base + 1})`;
  });
  const res = await p.query(
    `
    SELECT media_type, tmdb_id, array_agg(list_type) as list_types
    FROM user_media_list
    WHERE user_id = $1
      AND (media_type, tmdb_id) IN (${tuples.join(", ")})
    GROUP BY media_type, tmdb_id
    `,
    values
  );
  const map = new Map<string, { favorite: boolean; watchlist: boolean; watched: boolean }>();
  for (const row of res.rows) {
    const types = new Set((row.list_types as string[] | null) ?? []);
    const key = `${row.media_type}:${row.tmdb_id}`;
    map.set(key, {
      favorite: types.has("favorite"),
      watchlist: types.has("watchlist"),
      watched: types.has("watched")
    });
  }
  return map;
}


export async function hasUserMediaListEntry(input: {
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  listTypes?: UserMediaListType[];
}): Promise<boolean> {
  await ensureMediaListSchema();
  const p = getPool();
  const listTypes = Array.from(new Set((input.listTypes ?? ["favorite", "watchlist"]).filter(Boolean)));
  if (!listTypes.length) return false;

  const res = await p.query(
    `SELECT 1
     FROM user_media_list
     WHERE user_id = $1
       AND media_type = $2
       AND tmdb_id = $3
       AND list_type = ANY($4::text[])
     LIMIT 1`,
    [input.userId, input.mediaType, input.tmdbId, listTypes]
  );
  return res.rows.length > 0;
}
