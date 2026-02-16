-- Migration: 017_request_denied_by_user
-- Description: Track which admin denied a request
-- Created: 2026-02-16

ALTER TABLE media_request
  ADD COLUMN IF NOT EXISTS denied_by_user_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_request_denied_by_user_id
  ON media_request(denied_by_user_id);
