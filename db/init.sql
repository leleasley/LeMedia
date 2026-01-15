CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS app_user (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT,
  oidc_sub TEXT,
  jellyfin_user_id TEXT,
  jellyfin_username TEXT,
  jellyfin_device_id TEXT,
  jellyfin_auth_token TEXT,
  avatar_url TEXT,
  avatar_version INTEGER NOT NULL DEFAULT 0,
  request_limit_movie INTEGER,
  request_limit_movie_days INTEGER,
  request_limit_series INTEGER,
  request_limit_series_days INTEGER,
  groups TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS oidc_sub TEXT;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_movie INTEGER;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_movie_days INTEGER;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_series INTEGER;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS request_limit_series_days INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_user_oidc_sub ON app_user(oidc_sub);

-- Notification endpoints (Discord/Telegram/Email/Webhook configs) and per-user subscriptions.
CREATE TABLE IF NOT EXISTS notification_endpoint (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('telegram','discord','email','webhook')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_global BOOLEAN NOT NULL DEFAULT FALSE,
  events JSONB NOT NULL DEFAULT '["request_pending","request_submitted","request_denied","request_failed","request_already_exists","issue_reported"]'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notification_endpoint_type ON notification_endpoint(type);
CREATE INDEX IF NOT EXISTS idx_notification_endpoint_enabled ON notification_endpoint(enabled);
CREATE INDEX IF NOT EXISTS idx_notification_endpoint_is_global ON notification_endpoint(is_global);

CREATE TABLE IF NOT EXISTS user_notification_endpoint (
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  endpoint_id BIGINT NOT NULL REFERENCES notification_endpoint(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, endpoint_id)
);
CREATE INDEX IF NOT EXISTS idx_user_notification_endpoint_user_id ON user_notification_endpoint(user_id);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  target TEXT,
  metadata JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE IF NOT EXISTS media_request (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_type TEXT NOT NULL CHECK (request_type IN ('movie','episode')),
  tmdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  requested_by BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  poster_path TEXT,
  backdrop_path TEXT,
  release_year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_item (
  id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES media_request(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('sonarr','radarr')),
  provider_id INTEGER,
  season INTEGER,
  episode INTEGER,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_request_created_at ON media_request(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_item_request_id ON request_item(request_id);

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
CREATE INDEX IF NOT EXISTS idx_media_issue_created_at ON media_issue(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_issue_tmdb ON media_issue(media_type, tmdb_id);

CREATE TABLE IF NOT EXISTS media_service (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('radarr','sonarr')),
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_media_service_type ON media_service(type);
CREATE INDEX IF NOT EXISTS idx_media_service_enabled ON media_service(enabled);

CREATE TABLE IF NOT EXISTS mfa_session (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('verify','setup')),
  secret TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mfa_session_user_id ON mfa_session(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_session_expires_at ON mfa_session(expires_at);

-- Performance optimization indexes: Add critical indexes on frequently-queried columns
-- This significantly speeds up search, discovery, and collection status checks
-- Expected improvement: 10-100x faster queries for media lookups

-- Add tmdb_id index to media_request for faster movie/tv lookups
CREATE INDEX IF NOT EXISTS idx_media_request_tmdb_id ON media_request(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_media_request_status ON media_request(status);

-- Composite indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_media_request_type_status ON media_request(request_type, status);
CREATE INDEX IF NOT EXISTS idx_media_request_tmdb_status ON media_request(tmdb_id, status);
CREATE INDEX IF NOT EXISTS idx_media_request_user_status ON media_request(requested_by, status);

-- Title index for searching media
CREATE INDEX IF NOT EXISTS idx_media_request_title ON media_request(title);

-- Request item indexes
CREATE INDEX IF NOT EXISTS idx_request_item_status ON request_item(status);
CREATE INDEX IF NOT EXISTS idx_request_item_provider ON request_item(provider);
CREATE INDEX IF NOT EXISTS idx_request_item_provider_id ON request_item(provider, provider_id);

-- Media issue indexes
CREATE INDEX IF NOT EXISTS idx_media_issue_tmdb_id ON media_issue(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_media_issue_status ON media_issue(status);
CREATE INDEX IF NOT EXISTS idx_media_issue_tmdb_status ON media_issue(tmdb_id, status);

-- User activity indexes
CREATE INDEX IF NOT EXISTS idx_app_user_created_at ON app_user(created_at);
CREATE INDEX IF NOT EXISTS idx_app_user_last_seen_at ON app_user(last_seen_at);

-- Notification lookup indexes
CREATE INDEX IF NOT EXISTS idx_user_notification_endpoint_endpoint_id ON user_notification_endpoint(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_notification_endpoint_created_at ON notification_endpoint(created_at);

-- User media lists (favorites/watchlist)
CREATE TABLE IF NOT EXISTS user_media_list (
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  list_type TEXT NOT NULL CHECK (list_type IN ('favorite','watchlist')),
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  tmdb_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, list_type, media_type, tmdb_id)
);
CREATE INDEX IF NOT EXISTS idx_user_media_list_user ON user_media_list(user_id, list_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_media_list_tmdb ON user_media_list(media_type, tmdb_id);

-- Per-user dashboard layout customization (Jellyseerr-style sliders)
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
CREATE INDEX IF NOT EXISTS idx_user_dashboard_slider_user_order ON user_dashboard_slider(user_id, order_index ASC);
CREATE INDEX IF NOT EXISTS idx_user_dashboard_slider_user_enabled ON user_dashboard_slider(user_id, enabled);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  target TEXT,
  metadata JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

-- Request comments system (for communication between users and admins)
CREATE TABLE IF NOT EXISTS request_comment (
  id BIGSERIAL PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES media_request(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  is_admin_comment BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_request_comment_request_id ON request_comment(request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_request_comment_user_id ON request_comment(user_id);

-- Auto-approval rules engine
CREATE TABLE IF NOT EXISTS approval_rule (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('user_trust','popularity','time_based','genre','content_rating')),
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_approval_rule_enabled_priority ON approval_rule(enabled, priority DESC);

-- Web Push subscriptions for PWA notifications
CREATE TABLE IF NOT EXISTS push_subscription (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_subscription_user_id ON push_subscription(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscription_endpoint ON push_subscription(endpoint);

-- In-app notifications system (for user-specific notifications)
CREATE TABLE IF NOT EXISTS user_notification (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_notification_user_unread ON user_notification(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_notification_created_at ON user_notification(created_at DESC);

-- Recently viewed tracking (for personalized experience)
CREATE TABLE IF NOT EXISTS recently_viewed (
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  tmdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  poster_path TEXT,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, media_type, tmdb_id)
);
CREATE INDEX IF NOT EXISTS idx_recently_viewed_user_time ON recently_viewed(user_id, last_viewed_at DESC);
