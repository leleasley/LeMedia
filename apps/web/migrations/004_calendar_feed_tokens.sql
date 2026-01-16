-- Migration: 004_calendar_feed_tokens
-- Description: Add per-user calendar feed tokens for iCal subscriptions
-- Created: 2026-01-16

CREATE TABLE IF NOT EXISTS calendar_feed_token (
  user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_feed_token_token ON calendar_feed_token(token);
