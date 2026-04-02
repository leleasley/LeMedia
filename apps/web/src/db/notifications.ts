import { getPool, ensureSchema } from "./core";


export type NotificationEndpointType =
  | "telegram"
  | "discord"
  | "email"
  | "webhook"
  | "webpush"
  | "gotify"
  | "ntfy"
  | "pushbullet"
  | "pushover"
  | "slack";


export type NotificationEndpointPublic = {
  id: number;
  name: string;
  type: NotificationEndpointType;
  enabled: boolean;
  is_global: boolean;
  owner_user_id: number | null;
  events: string[];
  types: number;
  created_at: string;
};


// Proper types for notification endpoint configs
export type TelegramConfig = {
  botToken: string;
  chatId: string;
};


export type DiscordConfig = {
  webhookUrl: string;
};


export type SlackConfig = {
  webhookUrl: string;
};


export type GotifyConfig = {
  baseUrl: string;
  token: string;
};


export type NtfyConfig = {
  topic: string;
  baseUrl?: string;
};


export type PushbulletConfig = {
  accessToken: string;
};


export type PushoverConfig = {
  apiToken: string;
  userKey: string;
};


export type EmailConfig = {
  to?: string;
  userEmailRequired?: boolean;
  emailFrom?: string;
  smtpHost?: string;
  smtpPort?: number;
  secure?: boolean;
  ignoreTls?: boolean;
  requireTls?: boolean;
  authUser?: string;
  authPass?: string;
  allowSelfSigned?: boolean;
  senderName?: string;
  senderAddress?: string;
  encryption?: "none" | "starttls" | "tls" | "default" | "opportunistic" | "implicit";
};


export type WebhookConfig = {
  url: string;
};


export type WebPushConfig = Record<string, never>;


export type NotificationEndpointConfig =
  | TelegramConfig
  | DiscordConfig
  | SlackConfig
  | GotifyConfig
  | NtfyConfig
  | PushbulletConfig
  | PushoverConfig
  | EmailConfig
  | WebhookConfig
  | WebPushConfig
  | Record<string, unknown>; // Fallback for unknown configs

export type NotificationEndpointFull =
  | (NotificationEndpointPublic & { type: "discord"; config: DiscordConfig })
  | (NotificationEndpointPublic & { type: "telegram"; config: TelegramConfig })
  | (NotificationEndpointPublic & { type: "slack"; config: SlackConfig })
  | (NotificationEndpointPublic & { type: "gotify"; config: GotifyConfig })
  | (NotificationEndpointPublic & { type: "ntfy"; config: NtfyConfig })
  | (NotificationEndpointPublic & { type: "pushbullet"; config: PushbulletConfig })
  | (NotificationEndpointPublic & { type: "pushover"; config: PushoverConfig })
  | (NotificationEndpointPublic & { type: "email"; config: EmailConfig })
  | (NotificationEndpointPublic & { type: "webpush"; config: WebPushConfig })
  | (NotificationEndpointPublic & { type: "webhook"; config: WebhookConfig });


export async function listNotificationEndpoints(): Promise<NotificationEndpointPublic[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, owner_user_id, events, types, created_at
    FROM notification_endpoint
    ORDER BY created_at DESC
    `
  );
  return res.rows.map(r => {
    const id = Number(r.id);
    return {
      id,
      name: r.name,
      type: r.type,
      enabled: !!r.enabled,
      is_global: !!r.is_global,
      owner_user_id: r.owner_user_id == null ? null : Number(r.owner_user_id),
      events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
      types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
      config: r.config,
      created_at: r.created_at
    };
  });
}


export async function listNotificationEndpointsFull(): Promise<NotificationEndpointFull[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, owner_user_id, events, types, config, created_at
    FROM notification_endpoint
    ORDER BY created_at DESC
    `
  );
  return res.rows.map(r => {
    const id = Number(r.id);
    return {
      id,
      name: r.name,
      type: r.type,
      enabled: !!r.enabled,
      is_global: !!r.is_global,
      owner_user_id: r.owner_user_id == null ? null : Number(r.owner_user_id),
      events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
      types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
      config: r.config,
      created_at: r.created_at
    };
  });
}


export async function createNotificationEndpoint(input: {
  name: string;
  type: NotificationEndpointType;
  enabled?: boolean;
  is_global?: boolean;
  owner_user_id?: number | null;
  events?: string[];
  config: NotificationEndpointConfig;
}) {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    INSERT INTO notification_endpoint (name, type, enabled, is_global, owner_user_id, events, config)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
    RETURNING id, name, type, enabled, is_global, owner_user_id, events, types, created_at
    `,
    [
      input.name,
      input.type,
      input.enabled ?? true,
      input.is_global ?? false,
      input.owner_user_id ?? null,
      JSON.stringify(
        input.events ?? [
          "request_pending",
          "request_submitted",
          "request_denied",
          "request_failed",
          "request_already_exists",
          "request_partially_available",
          "request_downloading",
          "request_available",
          "request_removed",
          "issue_reported",
          "issue_resolved",
          "watch_party_invite",
          "watch_party_join_request",
          "watch_party_join_request_approved",
          "watch_party_join_request_denied"
        ]
      ),
      JSON.stringify(input.config ?? {})
    ]
  );
  const row = res.rows[0];
  return {
    id: row.id as number,
    name: row.name as string,
    type: row.type as NotificationEndpointType,
    enabled: !!row.enabled,
    is_global: !!row.is_global,
    owner_user_id: row.owner_user_id == null ? null : Number(row.owner_user_id),
    events: Array.isArray(row.events) ? row.events.map((e: unknown) => String(e)) : [],
    types: Number.isFinite(Number(row.types)) ? Number(row.types) : 0,
    created_at: row.created_at as string
  };
}


export async function deleteNotificationEndpoint(id: number) {
  await ensureSchema();
  const p = getPool();
  await p.query(`DELETE FROM notification_endpoint WHERE id = $1`, [id]);
}


export async function getNotificationEndpointByIdFull(id: number): Promise<NotificationEndpointFull | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, owner_user_id, events, types, config, created_at
    FROM notification_endpoint
    WHERE id = $1
    LIMIT 1
    `,
    [id]
  );
  if (!res.rows.length) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    enabled: !!r.enabled,
    is_global: !!r.is_global,
    owner_user_id: r.owner_user_id == null ? null : Number(r.owner_user_id),
    events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
    types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
    config: r.config,
    created_at: r.created_at
  };
}


export async function updateNotificationEndpoint(
  id: number,
  input: {
    name: string;
    enabled: boolean;
    is_global: boolean;
    owner_user_id?: number | null;
    events: string[];
    config: NotificationEndpointConfig;
  }

): Promise<NotificationEndpointPublic | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    UPDATE notification_endpoint
    SET name = $2,
        enabled = $3,
        is_global = $4,
        owner_user_id = $5,
        events = $6::jsonb,
        config = $7::jsonb
    WHERE id = $1
    RETURNING id, name, type, enabled, is_global, owner_user_id, events, types, created_at
    `,
    [
      id,
      input.name,
      input.enabled,
      input.is_global,
      input.owner_user_id ?? null,
      JSON.stringify(input.events ?? []),
      JSON.stringify(input.config ?? {})
    ]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: row.id as number,
    name: row.name as string,
    type: row.type as NotificationEndpointType,
    enabled: !!row.enabled,
    is_global: !!row.is_global,
    owner_user_id: row.owner_user_id == null ? null : Number(row.owner_user_id),
    events: Array.isArray(row.events) ? row.events.map((e: unknown) => String(e)) : [],
    types: Number.isFinite(Number(row.types)) ? Number(row.types) : 0,
    created_at: row.created_at as string
  };
}

export async function listGlobalNotificationEndpointsFull(): Promise<NotificationEndpointFull[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, owner_user_id, events, types, config, created_at
    FROM notification_endpoint
    WHERE enabled = TRUE AND is_global = TRUE
    ORDER BY created_at DESC
    `
  );
  return res.rows.map(r => {
    const id = Number(r.id);
    return {
      id,
      name: r.name,
      type: r.type,
      enabled: !!r.enabled,
      is_global: !!r.is_global,
      owner_user_id: r.owner_user_id == null ? null : Number(r.owner_user_id),
      events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
      types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
      config: r.config,
      created_at: r.created_at
    };
  });
}


export async function listNotificationEndpointsForUser(userId: number): Promise<NotificationEndpointFull[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT e.id, e.name, e.type, e.enabled, e.is_global, e.owner_user_id, e.events, e.types, e.config, e.created_at
    FROM notification_endpoint e
    JOIN user_notification_endpoint u ON u.endpoint_id = e.id
    WHERE u.user_id = $1
      AND e.enabled = TRUE
    ORDER BY e.created_at DESC
    `,
    [userId]
  );
  return res.rows.map(r => {
    const id = Number(r.id);
    return {
      id,
      name: r.name,
      type: r.type,
      enabled: !!r.enabled,
      is_global: !!r.is_global,
      owner_user_id: r.owner_user_id == null ? null : Number(r.owner_user_id),
      events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
      types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
      config: r.config,
      created_at: r.created_at
    };
  });
}


export async function listNotificationEndpointsForAllUsers(): Promise<NotificationEndpointFull[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT DISTINCT e.id, e.name, e.type, e.enabled, e.is_global, e.owner_user_id, e.events, e.types, e.config, e.created_at
    FROM notification_endpoint e
    JOIN user_notification_endpoint u ON u.endpoint_id = e.id
    WHERE e.enabled = TRUE
    ORDER BY e.created_at DESC
    `
  );
  return res.rows.map(r => {
    const id = Number(r.id);
    return {
      id,
      name: r.name,
      type: r.type,
      enabled: !!r.enabled,
      is_global: !!r.is_global,
      owner_user_id: r.owner_user_id == null ? null : Number(r.owner_user_id),
      events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
      types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
      config: r.config,
      created_at: r.created_at
    };
  });
}


export async function listNotificationEndpointsForOwner(userId: number): Promise<NotificationEndpointFull[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, owner_user_id, events, types, config, created_at
    FROM notification_endpoint
    WHERE owner_user_id = $1
    ORDER BY created_at DESC
    `,
    [userId]
  );

  return res.rows.map((r) => ({
    id: Number(r.id),
    name: String(r.name),
    type: r.type,
    enabled: !!r.enabled,
    is_global: !!r.is_global,
    owner_user_id: r.owner_user_id == null ? null : Number(r.owner_user_id),
    events: Array.isArray(r.events) ? r.events.map((e: unknown) => String(e)) : [],
    types: Number.isFinite(Number(r.types)) ? Number(r.types) : 0,
    config: r.config,
    created_at: String(r.created_at),
  }));
}


export async function getNotificationEndpointByIdForOwner(id: number, userId: number): Promise<NotificationEndpointFull | null> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT id, name, type, enabled, is_global, owner_user_id, events, types, config, created_at
    FROM notification_endpoint
    WHERE id = $1 AND owner_user_id = $2
    LIMIT 1
    `,
    [id, userId]
  );
  if (!res.rows.length) return null;
  const row = res.rows[0];
  return {
    id: Number(row.id),
    name: String(row.name),
    type: row.type,
    enabled: !!row.enabled,
    is_global: !!row.is_global,
    owner_user_id: row.owner_user_id == null ? null : Number(row.owner_user_id),
    events: Array.isArray(row.events) ? row.events.map((e: unknown) => String(e)) : [],
    types: Number.isFinite(Number(row.types)) ? Number(row.types) : 0,
    config: row.config,
    created_at: String(row.created_at),
  };
}


export type NotificationDeliveryAttemptStatus = "success" | "failure" | "skipped";


export type NotificationDeliveryAttemptInput = {
  endpointId: number;
  endpointType: string;
  eventType: string;
  status: NotificationDeliveryAttemptStatus;
  attemptNumber?: number;
  durationMs?: number | null;
  errorMessage?: string | null;
  targetUserId?: number | null;
  metadata?: Record<string, unknown> | null;
};


export async function recordNotificationDeliveryAttempt(input: NotificationDeliveryAttemptInput): Promise<void> {
  await ensureSchema();
  const p = getPool();
  await p.query(
    `
    INSERT INTO notification_delivery_attempt (
      endpoint_id,
      endpoint_type,
      event_type,
      status,
      attempt_number,
      duration_ms,
      error_message,
      target_user_id,
      metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
    `,
    [
      input.endpointId,
      input.endpointType,
      input.eventType,
      input.status,
      Math.max(1, Number(input.attemptNumber ?? 1)),
      input.durationMs ?? null,
      input.errorMessage ?? null,
      input.targetUserId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
}


export type NotificationReliabilityChannelSummary = {
  channel: string;
  totalAttempts: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  retryCount: number;
  successRate: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
};


export type NotificationReliabilityFailure = {
  id: number;
  endpointId: number;
  endpointName: string;
  channel: string;
  eventType: string;
  attemptNumber: number;
  errorMessage: string | null;
  createdAt: string;
};


export type NotificationReliabilityOverview = {
  generatedAt: string;
  windowDays: number;
  channels: NotificationReliabilityChannelSummary[];
  recentFailures: NotificationReliabilityFailure[];
};


export type UserEpisodeReminderDelivery = {
  id: number;
  endpointId: number;
  endpointName: string;
  channel: string;
  status: NotificationDeliveryAttemptStatus;
  attemptNumber: number;
  errorMessage: string | null;
  createdAt: string;
};


export async function listUserEpisodeReminderDeliveries(
  userId: number,
  limit = 10
): Promise<UserEpisodeReminderDelivery[]> {
  await ensureSchema();
  const p = getPool();
  const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 50);
  const res = await p.query(
    `
    SELECT
      nda.id,
      nda.endpoint_id,
      COALESCE(ne.name, CONCAT('Endpoint #', nda.endpoint_id::text)) AS endpoint_name,
      nda.endpoint_type,
      nda.status,
      nda.attempt_number,
      nda.error_message,
      nda.created_at
    FROM notification_delivery_attempt nda
    LEFT JOIN notification_endpoint ne ON ne.id = nda.endpoint_id
    WHERE nda.target_user_id = $1
      AND nda.event_type = 'episode_air_reminder'
    ORDER BY nda.created_at DESC
    LIMIT $2
    `,
    [userId, safeLimit]
  );

  return res.rows.map((row) => ({
    id: Number(row.id),
    endpointId: Number(row.endpoint_id),
    endpointName: String(row.endpoint_name),
    channel: String(row.endpoint_type),
    status: String(row.status) as NotificationDeliveryAttemptStatus,
    attemptNumber: Number(row.attempt_number ?? 1),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
  }));
}


export async function clearNotificationDeliveryAttempts(input?: {
  status?: NotificationDeliveryAttemptStatus;
  olderThanDays?: number;
}): Promise<number> {
  await ensureSchema();
  const p = getPool();

  const params: Array<string | number> = [];
  const where: string[] = [];

  if (input?.status) {
    params.push(input.status);
    where.push(`status = $${params.length}`);
  }

  if (Number.isFinite(input?.olderThanDays)) {
    const safeDays = Math.min(Math.max(Math.floor(Number(input?.olderThanDays ?? 0)), 1), 3650);
    params.push(safeDays);
    where.push(`created_at < NOW() - ($${params.length}::int * interval '1 day')`);
  }

  const query = `
    DELETE FROM notification_delivery_attempt
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
  `;

  const res = await p.query(query, params);
  return Number(res.rowCount ?? 0);
}


export async function getNotificationReliabilityOverview(windowDays = 14): Promise<NotificationReliabilityOverview> {
  await ensureSchema();
  const p = getPool();
  const safeWindowDays = Math.max(1, Math.min(90, Math.floor(windowDays)));
  const intervalExpr = `${safeWindowDays} days`;

  const channelRes = await p.query(
    `
    WITH windowed AS (
      SELECT *
      FROM notification_delivery_attempt
      WHERE created_at >= NOW() - ($1::text)::interval
    ),
    grouped AS (
      SELECT
        endpoint_type AS channel,
        COUNT(*)::int AS total_attempts,
        COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
        COUNT(*) FILTER (WHERE status = 'failure')::int AS failure_count,
        COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped_count,
        COUNT(*) FILTER (WHERE attempt_number > 1)::int AS retry_count,
        MAX(created_at) AS last_attempt_at,
        MAX(created_at) FILTER (WHERE status = 'success') AS last_success_at,
        MAX(created_at) FILTER (WHERE status = 'failure') AS last_failure_at
      FROM windowed
      GROUP BY endpoint_type
    )
    SELECT
      g.channel,
      g.total_attempts,
      g.success_count,
      g.failure_count,
      g.skipped_count,
      g.retry_count,
      g.last_attempt_at,
      g.last_success_at,
      g.last_failure_at,
      (
        SELECT nda.error_message
        FROM notification_delivery_attempt nda
        WHERE nda.endpoint_type = g.channel
          AND nda.status = 'failure'
          AND nda.created_at >= NOW() - ($1::text)::interval
        ORDER BY nda.created_at DESC
        LIMIT 1
      ) AS last_error
    FROM grouped g
    ORDER BY g.total_attempts DESC, g.channel ASC
    `,
    [intervalExpr]
  );

  const failureRes = await p.query(
    `
    SELECT
      nda.id,
      nda.endpoint_id,
      COALESCE(ne.name, CONCAT('Endpoint #', nda.endpoint_id::text)) AS endpoint_name,
      nda.endpoint_type,
      nda.event_type,
      nda.attempt_number,
      nda.error_message,
      nda.created_at
    FROM notification_delivery_attempt nda
    LEFT JOIN notification_endpoint ne ON ne.id = nda.endpoint_id
    WHERE nda.status = 'failure'
      AND nda.created_at >= NOW() - ($1::text)::interval
    ORDER BY nda.created_at DESC
    LIMIT 25
    `,
    [intervalExpr]
  );

  const channels: NotificationReliabilityChannelSummary[] = channelRes.rows.map((row) => {
    const totalAttempts = Number(row.total_attempts ?? 0);
    const successCount = Number(row.success_count ?? 0);
    const failureCount = Number(row.failure_count ?? 0);
    const skippedCount = Number(row.skipped_count ?? 0);
    const retryCount = Number(row.retry_count ?? 0);
    return {
      channel: String(row.channel),
      totalAttempts,
      successCount,
      failureCount,
      skippedCount,
      retryCount,
      successRate: totalAttempts > 0 ? successCount / totalAttempts : 0,
      lastAttemptAt: row.last_attempt_at ? String(row.last_attempt_at) : null,
      lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
      lastFailureAt: row.last_failure_at ? String(row.last_failure_at) : null,
      lastError: row.last_error ? String(row.last_error) : null,
    };
  });

  const recentFailures: NotificationReliabilityFailure[] = failureRes.rows.map((row) => ({
    id: Number(row.id),
    endpointId: Number(row.endpoint_id),
    endpointName: String(row.endpoint_name),
    channel: String(row.endpoint_type),
    eventType: String(row.event_type),
    attemptNumber: Number(row.attempt_number ?? 1),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
  }));

  return {
    generatedAt: new Date().toISOString(),
    windowDays: safeWindowDays,
    channels,
    recentFailures,
  };
}


export async function listUserNotificationEndpointIds(userId: number): Promise<number[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `
    SELECT endpoint_id
    FROM user_notification_endpoint
    WHERE user_id = $1
    ORDER BY endpoint_id ASC
    `,
    [userId]
  );
  return res.rows
    .map(r => Number(r.endpoint_id))
    .filter(n => Number.isFinite(n));
}


export async function addUserNotificationEndpointId(userId: number, endpointId: number): Promise<void> {
  await ensureSchema();
  const p = getPool();
  await p.query(
    `INSERT INTO user_notification_endpoint (user_id, endpoint_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, endpointId]
  );
}


export async function setUserNotificationEndpointIds(userId: number, endpointIds: number[]) {
  await ensureSchema();
  const p = getPool();
  await p.query("BEGIN");
  try {
    await p.query(`DELETE FROM user_notification_endpoint WHERE user_id = $1`, [userId]);
    const unique = Array.from(new Set(endpointIds)).filter(n => Number.isFinite(n));
    for (const endpointId of unique) {
      await p.query(
        `INSERT INTO user_notification_endpoint (user_id, endpoint_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, endpointId]
      );
    }
    await p.query("COMMIT");
  } catch (e) {
    await p.query("ROLLBACK");
    throw e;
  }
}


// ===== User Notifications =====
export type UserNotification = {
  id: number;
  userId: number;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};


export async function createNotification(params: {
  userId: number;
  type: string;
  title: string;
  message: string;
  link?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<UserNotification> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO user_notification (user_id, type, title, message, link, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id as "userId", type, title, message, link, is_read as "isRead", metadata, created_at as "createdAt"`,
    [params.userId, params.type, params.title, params.message, params.link ?? null, params.metadata ? JSON.stringify(params.metadata) : null]
  );
  return res.rows[0];
}


export async function getUserNotifications(userId: number, limit = 50): Promise<UserNotification[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id as "userId", type, title, message, link, is_read as "isRead", metadata, created_at as "createdAt"
     FROM user_notification
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}


export async function getUnreadNotifications(userId: number): Promise<UserNotification[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, user_id as "userId", type, title, message, link, is_read as "isRead", metadata, created_at as "createdAt"
     FROM user_notification
     WHERE user_id = $1 AND is_read = false
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );
  return res.rows;
}


export async function getUnreadNotificationCount(userId: number): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*)::int as count FROM user_notification WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
  return res.rows[0]?.count ?? 0;
}


export async function markNotificationAsRead(notificationId: number, userId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE user_notification SET is_read = true WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}


export async function markAllNotificationsAsRead(userId: number): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE user_notification SET is_read = true WHERE user_id = $1 AND is_read = false`,
    [userId]
  );
}


export async function deleteNotification(notificationId: number, userId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `DELETE FROM user_notification WHERE id = $1 AND user_id = $2`,
    [notificationId, userId]
  );
  return (res.rowCount ?? 0) > 0;
}
