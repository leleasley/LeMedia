import { Pool } from "pg";
import { z } from "zod";
import cacheManager from "@/lib/cache-manager";
import { logger } from "@/lib/logger";
import { validateEnv } from "@/lib/env-validation";
import { decryptSecret, encryptSecret } from "@/lib/encryption";


export function decryptOptionalSecret(value?: string | null): string | null {
  if (!value) return null;
  try {
    return decryptSecret(value);
  } catch {
    return value;
  }
}

export function encryptOptionalSecret(value?: string | null): string | null {
  if (!value) return null;
  return encryptSecret(value);
}

const DatabaseUrlSchema = z.string().min(1);
let cachedDatabaseUrl: string | null = null;

export const dashboardSliderCache = cacheManager.getCache("dashboard-sliders", {
  stdTTL: 60,
  checkperiod: 120,
});

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    validateEnv();
    if (!cachedDatabaseUrl) {
      cachedDatabaseUrl = DatabaseUrlSchema.parse(process.env.DATABASE_URL);
    }
    pool = new Pool({
      connectionString: cachedDatabaseUrl,
      // Optimized connection pool settings (based on Seerr best practices)
      max: Number(process.env.DB_POOL_MAX ?? "50"), // Maximum pool size (default: 10 is too low)
      min: Number(process.env.DB_POOL_MIN ?? "2"), // Minimum idle connections
      idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT ?? "30000"), // Close idle connections after 30s
      connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT ?? "10000"), // Wait max 10s for connection
      // Prevent connection leaks and improve reliability
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      // Query timeout (prevents hung queries)
      statement_timeout: Number(process.env.DB_STATEMENT_TIMEOUT ?? "30000"), // 30 seconds
      query_timeout: Number(process.env.DB_QUERY_TIMEOUT ?? "30000"),
    });

    // Handle pool errors gracefully
    pool.on("error", (err) => {
      logger.error("[DB] Unexpected database pool error", err);
    });
  }
  return pool;
}


export const ACTIVE_REQUEST_STATUSES = ["queued", "pending", "submitted"] as const;

export type ActiveRequestStatus = (typeof ACTIVE_REQUEST_STATUSES)[number];


export class ActiveRequestExistsError extends Error {
  requestId?: string;
  constructor(message: string, requestId?: string) {
    super(message);
    this.name = "ActiveRequestExistsError";
    this.requestId = requestId;
  }
}


export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const p = getPool();
    await p.query("SELECT 1");
    return true;
  } catch (err) {
    logger.error("[DB] Health check failed", err);
    return false;
  }
}

// Schema migration helpers (ensure tables exist)
let ensureUserSchemaPromise: Promise<void> | null = null;
export async function ensureUserSchema() {
  if (ensureUserSchemaPromise) return ensureUserSchemaPromise;
  ensureUserSchemaPromise = (async () => {
    const p = getPool();
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS mfa_secret TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS oidc_sub TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS jellyfin_user_id TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS jellyfin_username TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS jellyfin_device_id TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS jellyfin_auth_token TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS letterboxd_username TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS discord_user_id TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS display_name TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_url TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_version INTEGER NOT NULL DEFAULT 0;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_movie INTEGER;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_movie_days INTEGER;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_series INTEGER;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_series_days INTEGER;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS discover_region TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS original_language TEXT;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS watchlist_sync_movies BOOLEAN DEFAULT FALSE;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS watchlist_sync_tv BOOLEAN DEFAULT FALSE;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE;`);
    await p.query(`ALTER TABLE app_user ADD COLUMN IF NOT EXISTS weekly_digest_opt_in BOOLEAN DEFAULT FALSE;`);
    await p.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_oidc_sub ON app_user(oidc_sub);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_app_user_jellyfin_user_id ON app_user(jellyfin_user_id);`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS mfa_session (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        type TEXT NOT NULL CHECK (type IN ('verify','setup')),
        secret TEXT,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_mfa_session_user_id ON mfa_session(user_id);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_mfa_session_expires_at ON mfa_session(expires_at);`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS user_oauth_account (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK (provider IN ('google','github','telegram')),
        provider_user_id TEXT NOT NULL,
        provider_email TEXT,
        provider_login TEXT,
        linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (provider, provider_user_id),
        UNIQUE (user_id, provider)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_oauth_account_user_id ON user_oauth_account(user_id);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_oauth_account_provider ON user_oauth_account(provider);`);
    await p.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'user_oauth_account_provider_check'
            AND conrelid = 'user_oauth_account'::regclass
        ) THEN
          ALTER TABLE user_oauth_account
          ADD CONSTRAINT user_oauth_account_provider_check
          CHECK (provider IN ('google','github','telegram')) NOT VALID;
        END IF;
      END $$;
    `);
    await p.query(`ALTER TABLE user_oauth_account VALIDATE CONSTRAINT user_oauth_account_provider_check;`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_credential (
        id TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name TEXT,
        public_key BYTEA NOT NULL,
        counter BIGINT NOT NULL DEFAULT 0,
        device_type TEXT NOT NULL,
        backed_up BOOLEAN NOT NULL,
        transports TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`ALTER TABLE user_credential ADD COLUMN IF NOT EXISTS name TEXT;`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_credential_user_id ON user_credential(user_id);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_api_token (
        user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
        token_hash TEXT UNIQUE NOT NULL,
        token_encrypted TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_api_token_hash ON user_api_token(token_hash);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_api_token_v2 (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        token_encrypted TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_api_token_v2_user_id ON user_api_token_v2(user_id);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_api_token_v2_hash ON user_api_token_v2(token_hash);`);
    await p.query(`
      INSERT INTO user_api_token_v2 (user_id, name, token_hash, token_encrypted, created_at, updated_at)
      SELECT user_id, 'Default', token_hash, token_encrypted, created_at, updated_at
      FROM user_api_token
      WHERE NOT EXISTS (
        SELECT 1 FROM user_api_token_v2 v2 WHERE v2.token_hash = user_api_token.token_hash
      )
    `);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_password_history (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_password_history_user_id ON user_password_history(user_id);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS password_reset_token (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_token_hash ON password_reset_token(token_hash);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_token_user_id ON password_reset_token(user_id);`);
    await p.query(`ALTER TABLE password_reset_token ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_trakt_token (
        user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        scope TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_trakt_token_expires_at ON user_trakt_token(expires_at);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS followed_media (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        tmdb_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        poster_path TEXT,
        theatrical_release_date DATE,
        digital_release_date DATE,
        notify_on_theatrical BOOLEAN NOT NULL DEFAULT TRUE,
        notify_on_digital BOOLEAN NOT NULL DEFAULT TRUE,
        notified_theatrical_at TIMESTAMPTZ,
        notified_digital_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (user_id, media_type, tmdb_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_followed_media_user_created ON followed_media(user_id, created_at DESC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_followed_media_due_theatrical ON followed_media(notify_on_theatrical, theatrical_release_date, notified_theatrical_at);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_followed_media_due_digital ON followed_media(notify_on_digital, digital_release_date, notified_digital_at);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_telegram_preference (
        user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
        followed_media_notifications BOOLEAN NOT NULL DEFAULT FALSE,
        episode_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        episode_reminder_primary_minutes INTEGER NOT NULL DEFAULT 1440,
        episode_reminder_second_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        episode_reminder_second_minutes INTEGER NOT NULL DEFAULT 60,
        episode_reminder_telegram_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        reminder_timezone TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`ALTER TABLE user_telegram_preference ADD COLUMN IF NOT EXISTS episode_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE;`);
    await p.query(`ALTER TABLE user_telegram_preference ADD COLUMN IF NOT EXISTS episode_reminder_primary_minutes INTEGER NOT NULL DEFAULT 1440;`);
    await p.query(`ALTER TABLE user_telegram_preference ADD COLUMN IF NOT EXISTS episode_reminder_second_enabled BOOLEAN NOT NULL DEFAULT TRUE;`);
    await p.query(`ALTER TABLE user_telegram_preference ADD COLUMN IF NOT EXISTS episode_reminder_second_minutes INTEGER NOT NULL DEFAULT 60;`);
    await p.query(`ALTER TABLE user_telegram_preference ADD COLUMN IF NOT EXISTS episode_reminder_telegram_enabled BOOLEAN NOT NULL DEFAULT TRUE;`);
    await p.query(`ALTER TABLE user_telegram_preference ADD COLUMN IF NOT EXISTS episode_reminder_24h BOOLEAN NOT NULL DEFAULT TRUE;`);
    await p.query(`ALTER TABLE user_telegram_preference ADD COLUMN IF NOT EXISTS episode_reminder_1h BOOLEAN NOT NULL DEFAULT TRUE;`);
    await p.query(`ALTER TABLE user_telegram_preference ADD COLUMN IF NOT EXISTS reminder_timezone TEXT;`);
    await p.query(`
      UPDATE user_telegram_preference
      SET
        episode_reminder_primary_minutes = CASE
          WHEN COALESCE(episode_reminder_24h, TRUE) THEN 1440
          ELSE episode_reminder_primary_minutes
        END,
        episode_reminder_second_enabled = COALESCE(episode_reminder_1h, TRUE),
        episode_reminder_second_minutes = CASE
          WHEN COALESCE(episode_reminder_1h, TRUE) THEN 60
          ELSE episode_reminder_second_minutes
        END
      WHERE episode_reminder_primary_minutes IS NULL OR episode_reminder_second_minutes IS NULL
    `).catch(() => {});

    await p.query(`
      CREATE TABLE IF NOT EXISTS webauthn_challenge (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id BIGINT REFERENCES app_user(id) ON DELETE CASCADE,
        challenge TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_webauthn_challenge_expires_at ON webauthn_challenge(expires_at);`);

    await p.query(`ALTER TABLE user_session ADD COLUMN IF NOT EXISTS user_agent TEXT;`);
    await p.query(`ALTER TABLE user_session ADD COLUMN IF NOT EXISTS device_label TEXT;`);
    await p.query(`ALTER TABLE user_session ADD COLUMN IF NOT EXISTS ip_address TEXT;`);
  })();
  return ensureUserSchemaPromise;
}

let ensureMediaListSchemaPromise: Promise<void> | null = null;
export async function ensureMediaListSchema() {
  if (ensureMediaListSchemaPromise) return ensureMediaListSchemaPromise;
  ensureMediaListSchemaPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS user_media_list (
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        list_type TEXT NOT NULL CHECK (list_type IN ('favorite','watchlist','watched')),
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        tmdb_id INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, list_type, media_type, tmdb_id)
      );
    `);
    await p.query(`ALTER TABLE user_media_list DROP CONSTRAINT IF EXISTS user_media_list_list_type_check;`);
    await p.query(`
      ALTER TABLE user_media_list
      ADD CONSTRAINT user_media_list_list_type_check
      CHECK (list_type IN ('favorite','watchlist','watched'));
    `).catch(() => {});
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_media_list_user ON user_media_list(user_id, list_type, created_at DESC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_media_list_tmdb ON user_media_list(media_type, tmdb_id);`);
  })();
  return ensureMediaListSchemaPromise;
}

let ensureSchemaPromise: Promise<void> | null = null;
export async function ensureSchema() {
  if (ensureSchemaPromise) return ensureSchemaPromise;
  ensureSchemaPromise = (async () => {
    const p = getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS notification_endpoint (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('telegram','discord','email','webhook','webpush','gotify','ntfy','pushbullet','pushover','slack')),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        is_global BOOLEAN NOT NULL DEFAULT FALSE,
        owner_user_id BIGINT REFERENCES app_user(id) ON DELETE CASCADE,
        events JSONB NOT NULL DEFAULT '["request_pending","request_submitted","request_denied","request_failed","request_already_exists","request_partially_available","request_downloading","request_available","request_removed","issue_reported","issue_resolved"]'::jsonb,
        config JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`ALTER TABLE notification_endpoint ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE;`);
    await p.query(`ALTER TABLE notification_endpoint ADD COLUMN IF NOT EXISTS is_global BOOLEAN NOT NULL DEFAULT FALSE;`);
    await p.query(`ALTER TABLE notification_endpoint ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES app_user(id) ON DELETE CASCADE;`);
    await p.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'notification_endpoint_type_check'
            AND conrelid = 'notification_endpoint'::regclass
        ) THEN
          ALTER TABLE notification_endpoint DROP CONSTRAINT notification_endpoint_type_check;
        END IF;
        ALTER TABLE notification_endpoint
          ADD CONSTRAINT notification_endpoint_type_check
          CHECK (type IN ('telegram','discord','email','webhook','webpush','gotify','ntfy','pushbullet','pushover','slack'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await p.query(
      `ALTER TABLE notification_endpoint ADD COLUMN IF NOT EXISTS events JSONB NOT NULL DEFAULT '["request_pending","request_submitted","request_denied","request_failed","request_already_exists","request_partially_available","request_downloading","request_available","request_removed","issue_reported","issue_resolved"]'::jsonb;`
    );
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_endpoint_type ON notification_endpoint(type);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_endpoint_enabled ON notification_endpoint(enabled);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_endpoint_is_global ON notification_endpoint(is_global);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_endpoint_owner_user_id ON notification_endpoint(owner_user_id);`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS app_setting (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`
      CREATE TABLE IF NOT EXISTS user_notification_endpoint (
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        endpoint_id BIGINT NOT NULL REFERENCES notification_endpoint(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, endpoint_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_notification_endpoint_user_id ON user_notification_endpoint(user_id);`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS notification_delivery_attempt (
        id BIGSERIAL PRIMARY KEY,
        endpoint_id BIGINT NOT NULL REFERENCES notification_endpoint(id) ON DELETE CASCADE,
        endpoint_type TEXT NOT NULL,
        event_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('success','failure','skipped')),
        attempt_number INTEGER NOT NULL DEFAULT 1,
        duration_ms INTEGER,
        error_message TEXT,
        target_user_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempt_created_at ON notification_delivery_attempt(created_at DESC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempt_endpoint_id ON notification_delivery_attempt(endpoint_id, created_at DESC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempt_endpoint_type ON notification_delivery_attempt(endpoint_type, created_at DESC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempt_status ON notification_delivery_attempt(status, created_at DESC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notification_delivery_attempt_user_event_created ON notification_delivery_attempt(target_user_id, event_type, created_at DESC);`);
    await p.query(`
      CREATE TABLE IF NOT EXISTS media_issue (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        tmdb_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        reporter_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_issue_created_at ON media_issue(created_at DESC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_issue_tmdb ON media_issue(media_type, tmdb_id);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS user_dashboard_slider (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        type INTEGER NOT NULL,
        title TEXT,
        data TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        order_index INTEGER NOT NULL DEFAULT 0,
        is_builtin BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_dashboard_slider_user_order ON user_dashboard_slider(user_id, order_index ASC);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_user_dashboard_slider_user_enabled ON user_dashboard_slider(user_id, enabled);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS recently_viewed (
        user_id INTEGER NOT NULL,
        media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('movie', 'tv')),
        tmdb_id INTEGER NOT NULL,
        title VARCHAR(500) NOT NULL,
        poster_path VARCHAR(500),
        last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, media_type, tmdb_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_time ON recently_viewed(user_id, last_viewed_at DESC);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS media_share (
        id SERIAL PRIMARY KEY,
        token VARCHAR(64) NOT NULL UNIQUE,
        media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('movie', 'tv')),
        tmdb_id INTEGER NOT NULL,
        created_by INTEGER NOT NULL,
        expires_at TIMESTAMPTZ,
        view_count INTEGER DEFAULT 0,
        max_views INTEGER,
        password_hash TEXT,
        last_viewed_at TIMESTAMPTZ,
        last_viewed_ip TEXT,
        last_viewed_referrer TEXT,
        last_viewed_country TEXT,
        last_viewed_ua_hash TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS password_hash TEXT;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_ip TEXT;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_referrer TEXT;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_country TEXT;`);
    await p.query(`ALTER TABLE media_share ADD COLUMN IF NOT EXISTS last_viewed_ua_hash TEXT;`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_share_token ON media_share(token);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_share_created_by ON media_share(created_by);`);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_media_share_expires ON media_share(expires_at);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS upgrade_finder_hint (
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        media_id INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('available','none','error')),
        hint_text TEXT,
        checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (media_type, media_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_upgrade_finder_hint_checked_at ON upgrade_finder_hint(checked_at DESC);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS upgrade_finder_override (
        media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
        media_id INTEGER NOT NULL,
        ignore_4k BOOLEAN NOT NULL DEFAULT FALSE,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (media_type, media_id)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_upgrade_finder_override_updated_at ON upgrade_finder_override(updated_at DESC);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS notified_season (
        request_id UUID NOT NULL REFERENCES media_request(id) ON DELETE CASCADE,
        season INTEGER NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (request_id, season)
      );
    `);
    await p.query(`CREATE INDEX IF NOT EXISTS idx_notified_season_request_id ON notified_season(request_id);`);

    await p.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        schedule VARCHAR(50) NOT NULL DEFAULT '0 * * * *',
        interval_seconds INTEGER DEFAULT 3600,
        type VARCHAR(50) NOT NULL DEFAULT 'system',
        enabled BOOLEAN DEFAULT TRUE,
        last_run TIMESTAMPTZ,
        next_run TIMESTAMPTZ,
        run_on_start BOOLEAN DEFAULT FALSE,
        failure_count INTEGER DEFAULT 0,
        last_error TEXT,
        disabled_reason TEXT
      );
    `);
    await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0;`);
    await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_error TEXT;`);
    await p.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS disabled_reason TEXT;`);
    await p.query(`
      INSERT INTO jobs (name, schedule, interval_seconds, type, run_on_start)
      VALUES
          ('request-sync', '*/5 * * * *', 300, 'system', TRUE),
          ('new-season-notifications', '*/15 * * * *', 900, 'system', TRUE),
          ('watchlist-sync', '0 * * * *', 3600, 'system', FALSE),
          ('letterboxd-import', '0 4 * * *', 86400, 'system', FALSE),
          ('weekly-digest', '0 9 * * 1', 604800, 'system', FALSE),
          ('telegram-admin-digest', '0 9 * * *', 86400, 'system', FALSE),
          ('session-cleanup', '0 * * * *', 3600, 'system', TRUE),
          ('jellyfin-availability-sync', '0 */4 * * *', 14400, 'system', FALSE),
          ('upgrade-finder-4k', '0 3 * * *', 86400, 'system', FALSE),
          ('prowlarr-indexer-sync', '*/5 * * * *', 300, 'system', TRUE),
          ('plex-availability-sync', '0 */4 * * *', 14400, 'system', FALSE),
          ('system-alerts', '*/5 * * * *', 300, 'system', TRUE),
          ('episode-air-reminders', '*/30 * * * *', 1800, 'system', TRUE),
          ('followed-media-release-notifications', '0 * * * *', 3600, 'system', TRUE),
          ('calendar-assistant', '0 * * * *', 3600, 'system', TRUE),
          ('backup-snapshot', '30 2 * * *', 86400, 'system', FALSE)
      ON CONFLICT (name) DO NOTHING;
    `);
    await p.query(`DELETE FROM jobs WHERE name = 'calendar-notifications';`);
  })();
  return ensureSchemaPromise;
}

