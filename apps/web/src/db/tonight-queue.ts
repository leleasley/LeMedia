import { getPool } from "./core";

export type TonightMood = "comfort" | "focused" | "wildcard";

export type TonightQueuePreferences = {
  userId: number;
  mood: TonightMood;
  hideHorror: boolean;
  refreshSeed: number;
};

let ensureTonightQueueSchemaPromise: Promise<void> | null = null;

export async function ensureTonightQueueSchema() {
  if (ensureTonightQueueSchemaPromise) return ensureTonightQueueSchemaPromise;
  ensureTonightQueueSchemaPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS tonight_queue_preference (
        user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
        mood TEXT NOT NULL DEFAULT 'wildcard' CHECK (mood IN ('comfort','focused','wildcard')),
        hide_horror BOOLEAN NOT NULL DEFAULT FALSE,
        refresh_seed INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`
      CREATE TABLE IF NOT EXISTS tonight_queue_like (
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        tmdb_id INTEGER NOT NULL,
        genre_ids INTEGER[] NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, media_type, tmdb_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_tonight_queue_like_user ON tonight_queue_like(user_id, updated_at DESC);`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS tonight_queue_skip (
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        tmdb_id INTEGER NOT NULL,
        skipped_for_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, media_type, tmdb_id, skipped_for_date)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_tonight_queue_skip_user_date ON tonight_queue_skip(user_id, skipped_for_date DESC);`);
  })();
  return ensureTonightQueueSchemaPromise;
}

export async function getTonightQueuePreferences(userId: number): Promise<TonightQueuePreferences> {
  await ensureTonightQueueSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT user_id, mood, hide_horror, refresh_seed
    FROM tonight_queue_preference
    WHERE user_id = $1
    LIMIT 1
    `,
    [userId]
  );
  const row = res.rows[0];
  const mood = row?.mood === "comfort" || row?.mood === "focused" ? row.mood : "wildcard";
  return {
    userId,
    mood,
    hideHorror: Boolean(row?.hide_horror),
    refreshSeed: Number(row?.refresh_seed ?? 0),
  };
}

export async function updateTonightQueuePreferences(input: {
  userId: number;
  mood?: TonightMood;
  hideHorror?: boolean;
}) {
  await ensureTonightQueueSchema();
  const current = await getTonightQueuePreferences(input.userId);
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO tonight_queue_preference (user_id, mood, hide_horror, refresh_seed, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      mood = EXCLUDED.mood,
      hide_horror = EXCLUDED.hide_horror,
      updated_at = NOW()
    RETURNING user_id, mood, hide_horror, refresh_seed
    `,
    [
      input.userId,
      input.mood ?? current.mood,
      input.hideHorror ?? current.hideHorror,
      current.refreshSeed,
    ]
  );
  return {
    userId: Number(res.rows[0].user_id),
    mood: res.rows[0].mood as TonightMood,
    hideHorror: Boolean(res.rows[0].hide_horror),
    refreshSeed: Number(res.rows[0].refresh_seed ?? 0),
  } satisfies TonightQueuePreferences;
}

export async function incrementTonightQueueRefreshSeed(userId: number) {
  await ensureTonightQueueSchema();
  const prefs = await getTonightQueuePreferences(userId);
  const p = getPool();
  const nextSeed = prefs.refreshSeed + 1;
  const res = await p.query(
    `
    INSERT INTO tonight_queue_preference (user_id, mood, hide_horror, refresh_seed, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET refresh_seed = EXCLUDED.refresh_seed, updated_at = NOW()
    RETURNING user_id, mood, hide_horror, refresh_seed
    `,
    [userId, prefs.mood, prefs.hideHorror, nextSeed]
  );
  return {
    userId: Number(res.rows[0].user_id),
    mood: res.rows[0].mood as TonightMood,
    hideHorror: Boolean(res.rows[0].hide_horror),
    refreshSeed: Number(res.rows[0].refresh_seed ?? 0),
  } satisfies TonightQueuePreferences;
}

export async function saveTonightQueueLike(input: {
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  genreIds?: number[];
}) {
  await ensureTonightQueueSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO tonight_queue_like (user_id, media_type, tmdb_id, genre_ids, updated_at)
    VALUES ($1, $2, $3, $4::int[], NOW())
    ON CONFLICT (user_id, media_type, tmdb_id)
    DO UPDATE SET genre_ids = EXCLUDED.genre_ids, updated_at = NOW()
    `,
    [input.userId, input.mediaType, input.tmdbId, input.genreIds ?? []]
  );
}

export async function saveTonightQueueSkipForDate(input: {
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  isoDate: string;
}) {
  await ensureTonightQueueSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO tonight_queue_skip (user_id, media_type, tmdb_id, skipped_for_date)
    VALUES ($1, $2, $3, $4::date)
    ON CONFLICT DO NOTHING
    `,
    [input.userId, input.mediaType, input.tmdbId, input.isoDate]
  );
}

export async function getTonightQueueSkippedSet(userId: number, isoDate: string) {
  await ensureTonightQueueSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT media_type, tmdb_id
    FROM tonight_queue_skip
    WHERE user_id = $1 AND skipped_for_date = $2::date
    `,
    [userId, isoDate]
  );
  return new Set(res.rows.map((row) => `${row.media_type}:${Number(row.tmdb_id)}`));
}

export async function getTonightQueueLikedGenres(userId: number) {
  await ensureTonightQueueSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT genre_id, COUNT(*)::int AS weight
    FROM tonight_queue_like l
    CROSS JOIN LATERAL unnest(l.genre_ids) AS genre_id
    WHERE l.user_id = $1
    GROUP BY genre_id
    ORDER BY weight DESC, genre_id ASC
    LIMIT 12
    `,
    [userId]
  );
  return res.rows.map((row) => Number(row.genre_id)).filter((value) => Number.isFinite(value) && value > 0);
}