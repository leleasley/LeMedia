import { getPool, ensureMediaListSchema } from "./core";


export type UserMediaListType = "favorite" | "watchlist" | "watched";


export type UserMediaListItem = {
  user_id: number;
  list_type: UserMediaListType;
  media_type: "movie" | "tv";
  tmdb_id: number;
  created_at: string;
};


export type PendingReviewListItem = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  watchedAt: string;
};


export type UserTvWatchedSeasonItem = {
  userId: number;
  tmdbId: number;
  seasonNumber: number;
  createdAt: string;
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


export async function getPendingReviewQueue(input: {
  userId: number;
  limit?: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 24);

  const [countRes, itemsRes] = await Promise.all([
    p.query(
      `SELECT COUNT(*)::int AS count
       FROM user_media_list uml
       LEFT JOIN user_review ur
         ON ur.user_id = uml.user_id
        AND ur.media_type = uml.media_type
        AND ur.tmdb_id = uml.tmdb_id
       WHERE uml.user_id = $1
         AND uml.list_type = 'watched'
         AND ur.id IS NULL`,
      [input.userId]
    ),
    p.query(
      `SELECT uml.media_type, uml.tmdb_id, uml.created_at
       FROM user_media_list uml
       LEFT JOIN user_review ur
         ON ur.user_id = uml.user_id
        AND ur.media_type = uml.media_type
        AND ur.tmdb_id = uml.tmdb_id
       WHERE uml.user_id = $1
         AND uml.list_type = 'watched'
         AND ur.id IS NULL
       ORDER BY uml.created_at DESC
       LIMIT $2`,
      [input.userId, limit]
    )
  ]);

  return {
    count: Number(countRes.rows[0]?.count ?? 0),
    items: itemsRes.rows.map((row) => ({
      mediaType: row.media_type as "movie" | "tv",
      tmdbId: Number(row.tmdb_id),
      watchedAt: String(row.created_at),
    })) satisfies PendingReviewListItem[],
  };
}


export async function getUserTvWatchedSeasons(input: {
  userId: number;
  tmdbId: number;
}) {
  await ensureMediaListSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT user_id, tmdb_id, season_number, created_at
     FROM user_tv_watched_season
     WHERE user_id = $1 AND tmdb_id = $2
     ORDER BY season_number ASC`,
    [input.userId, input.tmdbId]
  );

  return res.rows.map((row) => ({
    userId: Number(row.user_id),
    tmdbId: Number(row.tmdb_id),
    seasonNumber: Number(row.season_number),
    createdAt: String(row.created_at),
  })) satisfies UserTvWatchedSeasonItem[];
}


export async function replaceUserTvWatchedSeasons(input: {
  userId: number;
  tmdbId: number;
  seasonNumbers: number[];
}) {
  await ensureMediaListSchema();
  const p = getPool();
  const seasonNumbers = Array.from(
    new Set(
      input.seasonNumbers
        .map((seasonNumber) => Number(seasonNumber))
        .filter((seasonNumber) => Number.isInteger(seasonNumber) && seasonNumber > 0)
    )
  ).sort((left, right) => left - right);

  const client = await p.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM user_tv_watched_season
       WHERE user_id = $1 AND tmdb_id = $2`,
      [input.userId, input.tmdbId]
    );

    if (seasonNumbers.length > 0) {
      const values = seasonNumbers.flatMap((seasonNumber) => [input.userId, input.tmdbId, seasonNumber]);
      const placeholders = seasonNumbers
        .map((_, index) => {
          const base = index * 3;
          return `($${base + 1}, $${base + 2}, $${base + 3})`;
        })
        .join(", ");

      await client.query(
        `INSERT INTO user_tv_watched_season (user_id, tmdb_id, season_number)
         VALUES ${placeholders}`,
        values
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return seasonNumbers;
}
