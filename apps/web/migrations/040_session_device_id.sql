-- Migration: 040_session_device_id
-- Description: Add device_id column to user_session for persistent device tracking across logins
-- Created: 2026-03-25

ALTER TABLE user_session ADD COLUMN IF NOT EXISTS device_id TEXT;

CREATE INDEX IF NOT EXISTS idx_user_session_device ON user_session(device_id)
  WHERE device_id IS NOT NULL;
