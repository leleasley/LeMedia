-- Migration: 041_user_devices
-- Description: Track persistent user devices for nicknames, trust, and network changes
-- Created: 2026-03-25

CREATE TABLE IF NOT EXISTS user_device (
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  nickname TEXT,
  trusted_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_ip_address TEXT,
  last_ip_address TEXT,
  previous_ip_address TEXT,
  last_ip_changed_at TIMESTAMPTZ,
  user_agent TEXT,
  device_label TEXT,
  PRIMARY KEY (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_device_user_seen ON user_device(user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_device_trusted ON user_device(user_id, trusted_at) WHERE trusted_at IS NOT NULL;
