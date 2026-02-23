-- Migration: 029_telegram_watch_alerts
-- Description: Store Telegram watch alerts and request notification state
-- Created: 2026-02-23

CREATE TABLE IF NOT EXISTS telegram_watch_alert (
  id BIGSERIAL PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notified_at TIMESTAMPTZ,
  UNIQUE (telegram_id, media_type, tmdb_id)
);

CREATE INDEX IF NOT EXISTS idx_twa_user_active ON telegram_watch_alert(user_id, active);
CREATE INDEX IF NOT EXISTS idx_twa_telegram_active ON telegram_watch_alert(telegram_id, active);
CREATE INDEX IF NOT EXISTS idx_twa_media ON telegram_watch_alert(media_type, tmdb_id);

CREATE TABLE IF NOT EXISTS telegram_request_status_state (
  telegram_id TEXT NOT NULL,
  request_id UUID NOT NULL REFERENCES media_request(id) ON DELETE CASCADE,
  last_status TEXT NOT NULL,
  last_reason TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (telegram_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_trss_updated_at ON telegram_request_status_state(updated_at DESC);
