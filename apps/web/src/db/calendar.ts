import { getPool, ensureUserSchema } from "./core";


export type CalendarAssistantPreference = {
  enabled: boolean;
  channels: string[];
  dayOfWeek: number;
  hourOfDay: number;
  lastSentDate: string | null;
};


export async function getCalendarAssistantPreference(userId: number): Promise<CalendarAssistantPreference> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       calendar_assistant_enabled,
       calendar_assistant_channels,
       calendar_assistant_day_of_week,
       calendar_assistant_hour,
       calendar_assistant_last_sent_date
     FROM app_user
     WHERE id = $1`,
    [userId]
  );

  const row = res.rows[0] ?? {};
  const channels = String(row.calendar_assistant_channels ?? "in_app")
    .split(",")
    .map((part: string) => part.trim())
    .filter(Boolean);

  return {
    enabled: !!row.calendar_assistant_enabled,
    channels: channels.length ? channels : ["in_app"],
    dayOfWeek: Math.min(Math.max(Number(row.calendar_assistant_day_of_week ?? 1), 0), 6),
    hourOfDay: Math.min(Math.max(Number(row.calendar_assistant_hour ?? 9), 0), 23),
    lastSentDate: row.calendar_assistant_last_sent_date ? String(row.calendar_assistant_last_sent_date) : null,
  };
}


export async function setCalendarAssistantPreference(
  userId: number,
  input: {
    enabled: boolean;
    channels: string[];
    dayOfWeek: number;
    hourOfDay: number;
  }

): Promise<CalendarAssistantPreference> {
  const p = getPool();
  const allowedChannels = new Set(["in_app", "telegram", "endpoints"]);
  const channels = Array.from(
    new Set(
      input.channels
        .map((part) => String(part || "").trim().toLowerCase())
        .filter((part) => allowedChannels.has(part))
    )
  );

  await p.query(
    `UPDATE app_user
     SET calendar_assistant_enabled = $1,
         calendar_assistant_channels = $2,
         calendar_assistant_day_of_week = $3,
         calendar_assistant_hour = $4
     WHERE id = $5`,
    [
      input.enabled,
      (channels.length ? channels : ["in_app"]).join(","),
      Math.min(Math.max(Math.floor(input.dayOfWeek), 0), 6),
      Math.min(Math.max(Math.floor(input.hourOfDay), 0), 23),
      userId,
    ]
  );

  return getCalendarAssistantPreference(userId);
}

export async function markCalendarAssistantSentDate(userId: number, localDateIso: string): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE app_user
     SET calendar_assistant_last_sent_date = $2::date
     WHERE id = $1`,
    [userId, localDateIso]
  );
}


export async function listCalendarAssistantRecipients(): Promise<Array<{
  userId: number;
  username: string;
  enabled: boolean;
  channels: string;
  dayOfWeek: number;
  hourOfDay: number;
  lastSentDate: string | null;
}>> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       id as "userId",
       username,
       calendar_assistant_enabled as enabled,
       calendar_assistant_channels as channels,
       calendar_assistant_day_of_week as "dayOfWeek",
       calendar_assistant_hour as "hourOfDay",
       calendar_assistant_last_sent_date as "lastSentDate"
     FROM app_user
     WHERE COALESCE(banned, FALSE) = FALSE`
  );

  return res.rows.map((row) => ({
    userId: Number(row.userId),
    username: String(row.username),
    enabled: !!row.enabled,
    channels: String(row.channels ?? "in_app"),
    dayOfWeek: Math.min(Math.max(Number(row.dayOfWeek ?? 1), 0), 6),
    hourOfDay: Math.min(Math.max(Number(row.hourOfDay ?? 9), 0), 23),
    lastSentDate: row.lastSentDate ? String(row.lastSentDate) : null,
  }));
}


// ===== Calendar Preferences =====

export interface CalendarPreferences {
  userId: number;
  defaultView: 'month' | 'week' | 'list' | 'agenda';
  filters: {
    movies: boolean;
    tv: boolean;
    requests: boolean;
    sonarr: boolean;
    radarr: boolean;
  };
  genreFilters: number[];
  monitoredOnly: boolean;
  createdAt: string;
  updatedAt: string;
}


export async function getCalendarPreferences(userId: number): Promise<CalendarPreferences | null> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      user_id as "userId",
      default_view as "defaultView",
      filters,
      genre_filters as "genreFilters",
      monitored_only as "monitoredOnly",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM calendar_preferences
    WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}


export async function setCalendarPreferences(
  userId: number,
  prefs: {
    defaultView?: 'month' | 'week' | 'list' | 'agenda';
    filters?: Record<string, unknown> | null;
    genreFilters?: number[];
    monitoredOnly?: boolean;
  }

): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO calendar_preferences
      (user_id, default_view, filters, genre_filters, monitored_only, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
      default_view = COALESCE($2, calendar_preferences.default_view),
      filters = COALESCE($3, calendar_preferences.filters),
      genre_filters = COALESCE($4, calendar_preferences.genre_filters),
      monitored_only = COALESCE($5, calendar_preferences.monitored_only),
      updated_at = NOW()`,
    [
      userId,
      prefs.defaultView || null,
      prefs.filters ? JSON.stringify(prefs.filters) : null,
      prefs.genreFilters || null,
      prefs.monitoredOnly !== undefined ? prefs.monitoredOnly : null
    ]
  );
}

// ===== Calendar Feed Tokens =====

export async function getCalendarFeedToken(userId: number): Promise<string> {
  const pool = getPool();
  const existing = await pool.query<{ token: string }>(
    `SELECT token
     FROM calendar_feed_token
     WHERE user_id = $1`,
    [userId]
  );
  if (existing.rows[0]?.token) return existing.rows[0].token;

  const inserted = await pool.query<{ token: string }>(
    `INSERT INTO calendar_feed_token (user_id)
     VALUES ($1)
     RETURNING token`,
    [userId]
  );
  return inserted.rows[0].token;
}


export async function rotateCalendarFeedToken(userId: number): Promise<string> {
  const pool = getPool();
  const result = await pool.query<{ token: string }>(
    `INSERT INTO calendar_feed_token (user_id, token, rotated_at)
     VALUES ($1, uuid_generate_v4(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET token = uuid_generate_v4(), rotated_at = NOW()
     RETURNING token`,
    [userId]
  );
  return result.rows[0].token;
}


export async function getCalendarFeedUserByToken(token: string): Promise<{ id: number; username: string } | null> {
  const pool = getPool();
  const result = await pool.query<{ id: number; username: string }>(
    `SELECT u.id, u.username
     FROM calendar_feed_token cft
     JOIN app_user u ON u.id = cft.user_id
     WHERE cft.token = $1`,
    [token]
  );
  return result.rows[0] || null;
}


// ===== Calendar Event Subscriptions =====

export interface CalendarEventSubscription {
  id: string;
  userId: number;
  eventType: 'movie_release' | 'tv_premiere' | 'tv_episode' | 'season_premiere';
  tmdbId: number;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  notifyOnAvailable: boolean;
  createdAt: string;
}


export type FollowedMediaItem = {
  id: string;
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  theatricalReleaseDate: string | null;
  digitalReleaseDate: string | null;
  notifyOnTheatrical: boolean;
  notifyOnDigital: boolean;
  notifiedTheatricalAt: string | null;
  notifiedDigitalAt: string | null;
  createdAt: string;
  updatedAt: string;
};


export type DueFollowedMediaReleaseNotification = FollowedMediaItem & {
  releaseType: "theatrical" | "digital";
  telegramId: string | null;
  telegramFollowOptIn: boolean;
};


export async function getUserTelegramFollowedMediaPreference(userId: number): Promise<boolean> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query<{ followed_media_notifications: boolean }>(
    `SELECT followed_media_notifications
     FROM user_telegram_preference
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  return !!res.rows[0]?.followed_media_notifications;
}


export async function setUserTelegramFollowedMediaPreference(userId: number, enabled: boolean): Promise<void> {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `INSERT INTO user_telegram_preference (user_id, followed_media_notifications, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET followed_media_notifications = EXCLUDED.followed_media_notifications, updated_at = NOW()`,
    [userId, enabled]
  );
}


export type UserEpisodeReminderPreference = {
  followedMediaNotifications: boolean;
  episodeReminderEnabled: boolean;
  episodeReminderPrimaryMinutes: number;
  episodeReminderSecondEnabled: boolean;
  episodeReminderSecondMinutes: number;
  episodeReminderTelegramEnabled: boolean;
  reminderTimezone: string | null;
};


export async function getUserEpisodeReminderPreference(userId: number): Promise<UserEpisodeReminderPreference> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query<{
    followed_media_notifications: boolean;
    episode_reminder_enabled: boolean;
    episode_reminder_primary_minutes: number;
    episode_reminder_second_enabled: boolean;
    episode_reminder_second_minutes: number;
    episode_reminder_telegram_enabled: boolean;
    reminder_timezone: string | null;
  }>(
    `SELECT
      followed_media_notifications,
      episode_reminder_enabled,
      episode_reminder_primary_minutes,
      episode_reminder_second_enabled,
      episode_reminder_second_minutes,
      episode_reminder_telegram_enabled,
      reminder_timezone
     FROM user_telegram_preference
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  const row = res.rows[0];
  return {
    followedMediaNotifications: row ? !!row.followed_media_notifications : false,
    episodeReminderEnabled: row ? !!row.episode_reminder_enabled : true,
    episodeReminderPrimaryMinutes: row ? Math.max(1, Number(row.episode_reminder_primary_minutes ?? 1440) || 1440) : 1440,
    episodeReminderSecondEnabled: row ? !!row.episode_reminder_second_enabled : true,
    episodeReminderSecondMinutes: row ? Math.max(1, Number(row.episode_reminder_second_minutes ?? 60) || 60) : 60,
    episodeReminderTelegramEnabled: row ? !!row.episode_reminder_telegram_enabled : true,
    reminderTimezone: row?.reminder_timezone ? String(row.reminder_timezone) : null,
  };
}


export async function setUserEpisodeReminderPreference(
  userId: number,
  input: {
    followedMediaNotifications: boolean;
    episodeReminderEnabled: boolean;
    episodeReminderPrimaryMinutes: number;
    episodeReminderSecondEnabled: boolean;
    episodeReminderSecondMinutes: number;
    episodeReminderTelegramEnabled: boolean;
    reminderTimezone: string | null;
  }

): Promise<void> {
  await ensureUserSchema();
  const p = getPool();
  await p.query(
    `INSERT INTO user_telegram_preference (
      user_id,
      followed_media_notifications,
      episode_reminder_enabled,
      episode_reminder_primary_minutes,
      episode_reminder_second_enabled,
      episode_reminder_second_minutes,
      episode_reminder_telegram_enabled,
      reminder_timezone,
      updated_at
    )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
      followed_media_notifications = EXCLUDED.followed_media_notifications,
      episode_reminder_enabled = EXCLUDED.episode_reminder_enabled,
      episode_reminder_primary_minutes = EXCLUDED.episode_reminder_primary_minutes,
      episode_reminder_second_enabled = EXCLUDED.episode_reminder_second_enabled,
      episode_reminder_second_minutes = EXCLUDED.episode_reminder_second_minutes,
      episode_reminder_telegram_enabled = EXCLUDED.episode_reminder_telegram_enabled,
      reminder_timezone = EXCLUDED.reminder_timezone,
      updated_at = NOW()`,
    [
      userId,
      input.followedMediaNotifications,
      input.episodeReminderEnabled,
      Math.min(Math.max(Math.floor(input.episodeReminderPrimaryMinutes), 1), 43200),
      input.episodeReminderSecondEnabled,
      Math.min(Math.max(Math.floor(input.episodeReminderSecondMinutes), 1), 43200),
      input.episodeReminderTelegramEnabled,
      input.reminderTimezone,
    ]
  );
}

export async function listFollowedMediaForUser(userId: number): Promise<FollowedMediaItem[]> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT
      id,
      user_id as "userId",
      media_type as "mediaType",
      tmdb_id as "tmdbId",
      title,
      poster_path as "posterPath",
      theatrical_release_date::text as "theatricalReleaseDate",
      digital_release_date::text as "digitalReleaseDate",
      notify_on_theatrical as "notifyOnTheatrical",
      notify_on_digital as "notifyOnDigital",
      notified_theatrical_at as "notifiedTheatricalAt",
      notified_digital_at as "notifiedDigitalAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
     FROM followed_media
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows;
}


export async function getFollowedMediaByTmdb(userId: number, mediaType: "movie" | "tv", tmdbId: number): Promise<FollowedMediaItem | null> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT
      id,
      user_id as "userId",
      media_type as "mediaType",
      tmdb_id as "tmdbId",
      title,
      poster_path as "posterPath",
      theatrical_release_date::text as "theatricalReleaseDate",
      digital_release_date::text as "digitalReleaseDate",
      notify_on_theatrical as "notifyOnTheatrical",
      notify_on_digital as "notifyOnDigital",
      notified_theatrical_at as "notifiedTheatricalAt",
      notified_digital_at as "notifiedDigitalAt",
      created_at as "createdAt",
      updated_at as "updatedAt"
     FROM followed_media
     WHERE user_id = $1 AND media_type = $2 AND tmdb_id = $3
     LIMIT 1`,
    [userId, mediaType, tmdbId]
  );
  return res.rows[0] ?? null;
}


export async function upsertFollowedMedia(input: {
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath?: string | null;
  theatricalReleaseDate?: string | null;
  digitalReleaseDate?: string | null;
  notifyOnTheatrical?: boolean;
  notifyOnDigital?: boolean;
}): Promise<FollowedMediaItem> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `INSERT INTO followed_media (
      user_id,
      media_type,
      tmdb_id,
      title,
      poster_path,
      theatrical_release_date,
      digital_release_date,
      notify_on_theatrical,
      notify_on_digital,
      updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (user_id, media_type, tmdb_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      poster_path = EXCLUDED.poster_path,
      theatrical_release_date = EXCLUDED.theatrical_release_date,
      digital_release_date = EXCLUDED.digital_release_date,
      notify_on_theatrical = EXCLUDED.notify_on_theatrical,
      notify_on_digital = EXCLUDED.notify_on_digital,
      updated_at = NOW()
    RETURNING
      id,
      user_id as "userId",
      media_type as "mediaType",
      tmdb_id as "tmdbId",
      title,
      poster_path as "posterPath",
      theatrical_release_date::text as "theatricalReleaseDate",
      digital_release_date::text as "digitalReleaseDate",
      notify_on_theatrical as "notifyOnTheatrical",
      notify_on_digital as "notifyOnDigital",
      notified_theatrical_at as "notifiedTheatricalAt",
      notified_digital_at as "notifiedDigitalAt",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      input.userId,
      input.mediaType,
      input.tmdbId,
      input.title,
      input.posterPath ?? null,
      input.theatricalReleaseDate ?? null,
      input.digitalReleaseDate ?? null,
      input.notifyOnTheatrical ?? true,
      input.notifyOnDigital ?? true,
    ]
  );
  return res.rows[0];
}


export async function removeFollowedMediaById(userId: number, id: string): Promise<boolean> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(`DELETE FROM followed_media WHERE user_id = $1 AND id = $2`, [userId, id]);
  return (res.rowCount ?? 0) > 0;
}


export async function removeFollowedMediaByTmdb(userId: number, mediaType: "movie" | "tv", tmdbId: number): Promise<boolean> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(`DELETE FROM followed_media WHERE user_id = $1 AND media_type = $2 AND tmdb_id = $3`, [userId, mediaType, tmdbId]);
  return (res.rowCount ?? 0) > 0;
}


export async function updateFollowedMediaOptions(userId: number, id: string, input: {
  notifyOnTheatrical?: boolean;
  notifyOnDigital?: boolean;
}): Promise<FollowedMediaItem | null> {
  await ensureUserSchema();
  const clauses: string[] = [];
  const values: any[] = [userId, id];
  let idx = 3;
  if (input.notifyOnTheatrical !== undefined) {
    clauses.push(`notify_on_theatrical = $${idx++}`);
    values.push(input.notifyOnTheatrical);
  }
  if (input.notifyOnDigital !== undefined) {
    clauses.push(`notify_on_digital = $${idx++}`);
    values.push(input.notifyOnDigital);
  }
  if (clauses.length === 0) {
    return getPool().query(
      `SELECT
        id,
        user_id as "userId",
        media_type as "mediaType",
        tmdb_id as "tmdbId",
        title,
        poster_path as "posterPath",
        theatrical_release_date::text as "theatricalReleaseDate",
        digital_release_date::text as "digitalReleaseDate",
        notify_on_theatrical as "notifyOnTheatrical",
        notify_on_digital as "notifyOnDigital",
        notified_theatrical_at as "notifiedTheatricalAt",
        notified_digital_at as "notifiedDigitalAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
       FROM followed_media
       WHERE user_id = $1 AND id = $2
       LIMIT 1`,
      [userId, id]
    ).then(r => r.rows[0] ?? null);
  }
  const p = getPool();
  const res = await p.query(
    `UPDATE followed_media
     SET ${clauses.join(", ")}, updated_at = NOW()
     WHERE user_id = $1 AND id = $2
     RETURNING
      id,
      user_id as "userId",
      media_type as "mediaType",
      tmdb_id as "tmdbId",
      title,
      poster_path as "posterPath",
      theatrical_release_date::text as "theatricalReleaseDate",
      digital_release_date::text as "digitalReleaseDate",
      notify_on_theatrical as "notifyOnTheatrical",
      notify_on_digital as "notifyOnDigital",
      notified_theatrical_at as "notifiedTheatricalAt",
      notified_digital_at as "notifiedDigitalAt",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    values
  );
  return res.rows[0] ?? null;
}


export async function listDueFollowedMediaReleaseNotifications(
  limit = 200,
  timeZone = "Europe/London"
): Promise<DueFollowedMediaReleaseNotification[]> {
  await ensureUserSchema();
  const p = getPool();
  const res = await p.query(
    `WITH due_theatrical AS (
      SELECT
        f.id,
        f.user_id as "userId",
        f.media_type as "mediaType",
        f.tmdb_id as "tmdbId",
        f.title,
        f.poster_path as "posterPath",
        f.theatrical_release_date::text as "theatricalReleaseDate",
        f.digital_release_date::text as "digitalReleaseDate",
        f.notify_on_theatrical as "notifyOnTheatrical",
        f.notify_on_digital as "notifyOnDigital",
        f.notified_theatrical_at as "notifiedTheatricalAt",
        f.notified_digital_at as "notifiedDigitalAt",
        f.created_at as "createdAt",
        f.updated_at as "updatedAt",
        'theatrical'::text as "releaseType",
        tu.telegram_id as "telegramId",
        COALESCE(utp.followed_media_notifications, FALSE) as "telegramFollowOptIn"
      FROM followed_media f
      LEFT JOIN telegram_users tu ON tu.user_id = f.user_id
      LEFT JOIN user_telegram_preference utp ON utp.user_id = f.user_id
      WHERE f.notify_on_theatrical = TRUE
        AND f.notified_theatrical_at IS NULL
        AND f.theatrical_release_date IS NOT NULL
        AND f.theatrical_release_date <= (NOW() AT TIME ZONE $2)::date
    ), due_digital AS (
      SELECT
        f.id,
        f.user_id as "userId",
        f.media_type as "mediaType",
        f.tmdb_id as "tmdbId",
        f.title,
        f.poster_path as "posterPath",
        f.theatrical_release_date::text as "theatricalReleaseDate",
        f.digital_release_date::text as "digitalReleaseDate",
        f.notify_on_theatrical as "notifyOnTheatrical",
        f.notify_on_digital as "notifyOnDigital",
        f.notified_theatrical_at as "notifiedTheatricalAt",
        f.notified_digital_at as "notifiedDigitalAt",
        f.created_at as "createdAt",
        f.updated_at as "updatedAt",
        'digital'::text as "releaseType",
        tu.telegram_id as "telegramId",
        COALESCE(utp.followed_media_notifications, FALSE) as "telegramFollowOptIn"
      FROM followed_media f
      LEFT JOIN telegram_users tu ON tu.user_id = f.user_id
      LEFT JOIN user_telegram_preference utp ON utp.user_id = f.user_id
      WHERE f.notify_on_digital = TRUE
        AND f.notified_digital_at IS NULL
        AND f.digital_release_date IS NOT NULL
        AND f.digital_release_date <= (NOW() AT TIME ZONE $2)::date
    )
    SELECT *
    FROM (
      SELECT * FROM due_theatrical
      UNION ALL
      SELECT * FROM due_digital
    ) due
    ORDER BY "createdAt" ASC
    LIMIT $1`,
    [limit, timeZone]
  );
  return res.rows as DueFollowedMediaReleaseNotification[];
}


export async function markFollowedMediaReleaseNotified(id: string, releaseType: "theatrical" | "digital"): Promise<void> {
  await ensureUserSchema();
  const p = getPool();
  if (releaseType === "theatrical") {
    await p.query(`UPDATE followed_media SET notified_theatrical_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
    return;
  }
  await p.query(`UPDATE followed_media SET notified_digital_at = NOW(), updated_at = NOW() WHERE id = $1`, [id]);
}


export async function listCalendarSubscriptions(userId: number): Promise<CalendarEventSubscription[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      id,
      user_id as "userId",
      event_type as "eventType",
      tmdb_id as "tmdbId",
      season_number as "seasonNumber",
      episode_number as "episodeNumber",
      notify_on_available as "notifyOnAvailable",
      created_at as "createdAt"
    FROM calendar_event_subscription
    WHERE user_id = $1
    ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}


export async function addCalendarSubscription(data: {
  userId: number;
  eventType: 'movie_release' | 'tv_premiere' | 'tv_episode' | 'season_premiere';
  tmdbId: number;
  seasonNumber?: number;
  episodeNumber?: number;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO calendar_event_subscription
      (user_id, event_type, tmdb_id, season_number, episode_number)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, event_type, tmdb_id, season_number, episode_number)
    DO UPDATE SET notify_on_available = true`,
    [data.userId, data.eventType, data.tmdbId, data.seasonNumber || null, data.episodeNumber || null]
  );
}


export async function removeCalendarSubscription(subscriptionId: string, userId: number): Promise<boolean> {
  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM calendar_event_subscription
    WHERE id = $1 AND user_id = $2`,
    [subscriptionId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}


export async function listActiveCalendarSubscriptions(): Promise<CalendarEventSubscription[]> {
  const pool = getPool();
  const result = await pool.query(
    `SELECT
      id,
      user_id as "userId",
      event_type as "eventType",
      tmdb_id as "tmdbId",
      season_number as "seasonNumber",
      episode_number as "episodeNumber",
      notify_on_available as "notifyOnAvailable",
      created_at as "createdAt"
    FROM calendar_event_subscription
    WHERE notify_on_available = true
    ORDER BY created_at ASC`
  );
  return result.rows;
}


export async function disableCalendarSubscriptionNotifications(subscriptionId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE calendar_event_subscription
    SET notify_on_available = false
    WHERE id = $1`,
    [subscriptionId]
  );
}
