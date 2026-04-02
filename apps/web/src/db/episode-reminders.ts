import { normalizeGroupList } from "@/lib/groups";
import { getPool, ensureUserSchema, ensureMediaListSchema } from "./core";


export async function listTrackedTvForEpisodeReminders(maxShowsPerUser = 100): Promise<Array<{ userId: number; tmdbId: number }>> {
  await ensureMediaListSchema();
  await ensureUserSchema();
  const p = getPool();
  const perUserLimit = Math.min(Math.max(maxShowsPerUser, 1), 500);
  const res = await p.query(
    `WITH tracked_sources AS (
       SELECT uml.user_id, uml.tmdb_id, uml.created_at
       FROM user_media_list uml
       WHERE uml.media_type = 'tv'
         AND uml.list_type IN ('favorite', 'watchlist')

       UNION ALL

       SELECT fm.user_id, fm.tmdb_id, fm.created_at
       FROM followed_media fm
       WHERE fm.media_type = 'tv'
     ), dedup AS (
       SELECT ts.user_id, ts.tmdb_id, MAX(ts.created_at) AS last_added
       FROM tracked_sources ts
       JOIN app_user u ON u.id = ts.user_id
       WHERE COALESCE(u.banned, FALSE) = FALSE
       GROUP BY ts.user_id, ts.tmdb_id
     ), ranked AS (
       SELECT
         user_id,
         tmdb_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY last_added DESC, tmdb_id DESC) AS rn
       FROM dedup
     )
     SELECT user_id as "userId", tmdb_id as "tmdbId"
     FROM ranked
     WHERE rn <= $1
     ORDER BY user_id ASC, tmdb_id ASC`,
    [perUserLimit]
  );

  return res.rows.map((row) => ({
    userId: Number(row.userId),
    tmdbId: Number(row.tmdbId),
  }));
}


export async function markEpisodeAirReminderSent(input: {
  userId: number;
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  airDate: string;
  reminderType: string;
}): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO episode_air_reminder_sent
      (user_id, tmdb_id, season_number, episode_number, air_date, reminder_type)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, tmdb_id, season_number, episode_number, air_date, reminder_type) DO NOTHING
     RETURNING id`,
    [input.userId, input.tmdbId, input.seasonNumber, input.episodeNumber, input.airDate, input.reminderType]
  );
  return (res.rowCount ?? 0) > 0;
}


export async function cleanupEpisodeAirReminderSent(olderThanDays = 60): Promise<number> {
  const p = getPool();
  const days = Math.min(Math.max(olderThanDays, 1), 365);
  const res = await p.query(
    `DELETE FROM episode_air_reminder_sent
     WHERE created_at < NOW() - ($1::text || ' days')::interval`,
    [days]
  );
  return res.rowCount ?? 0;
}


export async function listEpisodeAirReminderTelegramTargets(userIds: number[]): Promise<Map<number, {
  telegramId: string | null;
  telegramFollowOptIn: boolean;
  episodeReminderEnabled: boolean;
  episodeReminderPrimaryMinutes: number;
  episodeReminderSecondEnabled: boolean;
  episodeReminderSecondMinutes: number;
  episodeReminderTelegramEnabled: boolean;
  reminderTimezone: string | null;
}>> {
  await ensureUserSchema();
  const out = new Map<number, {
    telegramId: string | null;
    telegramFollowOptIn: boolean;
    episodeReminderEnabled: boolean;
    episodeReminderPrimaryMinutes: number;
    episodeReminderSecondEnabled: boolean;
    episodeReminderSecondMinutes: number;
    episodeReminderTelegramEnabled: boolean;
    reminderTimezone: string | null;
  }>();
  if (!userIds.length) return out;

  const ids = Array.from(new Set(userIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return out;

  const p = getPool();
  const res = await p.query(
    `SELECT
       u.id as "userId",
       tu.telegram_id as "telegramId",
       COALESCE(utp.followed_media_notifications, FALSE) as "telegramFollowOptIn",
       COALESCE(utp.episode_reminder_enabled, TRUE) as "episodeReminderEnabled",
       COALESCE(utp.episode_reminder_primary_minutes, 1440) as "episodeReminderPrimaryMinutes",
       COALESCE(utp.episode_reminder_second_enabled, TRUE) as "episodeReminderSecondEnabled",
       COALESCE(utp.episode_reminder_second_minutes, 60) as "episodeReminderSecondMinutes",
       COALESCE(utp.episode_reminder_telegram_enabled, TRUE) as "episodeReminderTelegramEnabled",
       utp.reminder_timezone as "reminderTimezone"
     FROM app_user u
     LEFT JOIN telegram_users tu ON tu.user_id = u.id
     LEFT JOIN user_telegram_preference utp ON utp.user_id = u.id
     WHERE u.id = ANY($1::bigint[])`,
    [ids]
  );

  for (const row of res.rows) {
    out.set(Number(row.userId), {
      telegramId: row.telegramId ? String(row.telegramId) : null,
      telegramFollowOptIn: !!row.telegramFollowOptIn,
      episodeReminderEnabled: !!row.episodeReminderEnabled,
      episodeReminderPrimaryMinutes: Math.max(1, Number(row.episodeReminderPrimaryMinutes ?? 1440) || 1440),
      episodeReminderSecondEnabled: !!row.episodeReminderSecondEnabled,
      episodeReminderSecondMinutes: Math.max(1, Number(row.episodeReminderSecondMinutes ?? 60) || 60),
      episodeReminderTelegramEnabled: !!row.episodeReminderTelegramEnabled,
      reminderTimezone: row.reminderTimezone ? String(row.reminderTimezone) : null,
    });
  }

  return out;
}


export async function listUsersWithWatchlistSync(userId?: number) {
  await ensureUserSchema();
  const p = getPool();
  const whereClauses = [
    "(jellyfin_user_id IS NOT NULL OR EXISTS (SELECT 1 FROM user_trakt_token utt WHERE utt.user_id = app_user.id))",
    "(watchlist_sync_movies = TRUE OR watchlist_sync_tv = TRUE)"
  ];
  const values: Array<number> = [];
  if (typeof userId === "number") {
    values.push(userId);
    whereClauses.push(`id = $${values.length}`);
  }
  const res = await p.query(
    `
    SELECT id, username, jellyfin_user_id, watchlist_sync_movies, watchlist_sync_tv, groups,
      EXISTS (SELECT 1 FROM user_trakt_token utt WHERE utt.user_id = app_user.id) AS has_trakt
    FROM app_user
    WHERE ${whereClauses.join(" AND ")}
    `,
    values
  );
  return res.rows.map(row => ({
    id: Number(row.id),
    username: row.username as string,
    jellyfinUserId: row.jellyfin_user_id as string,
    hasTrakt: !!row.has_trakt,
    syncMovies: !!row.watchlist_sync_movies,
    syncTv: !!row.watchlist_sync_tv,
    isAdmin: normalizeGroupList(row.groups as string).includes("administrators")
  }));
}


export async function listUsersWithLetterboxd() {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, username, letterboxd_username
    FROM app_user
    WHERE letterboxd_username IS NOT NULL AND letterboxd_username <> ''
    ORDER BY letterboxd_username ASC
    `
  );
  return res.rows.map(row => ({
    id: Number(row.id),
    username: row.username as string,
    letterboxdUsername: row.letterboxd_username as string
  }));
}
