-- Migration: 033_notification_endpoint_owner
-- Description: Add owner_user_id to notification endpoints for user-managed channels
-- Created: 2026-03-13

ALTER TABLE notification_endpoint
  ADD COLUMN IF NOT EXISTS owner_user_id BIGINT REFERENCES app_user(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_notification_endpoint_owner_user_id
  ON notification_endpoint(owner_user_id);
