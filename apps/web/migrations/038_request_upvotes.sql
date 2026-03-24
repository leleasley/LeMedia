-- Migration: 038_request_upvotes
-- Description: Request upvoting — users can upvote pending requests to signal interest
-- Created: 2026-03-24

CREATE TABLE IF NOT EXISTS request_upvote (
  request_id UUID    NOT NULL REFERENCES media_request(id) ON DELETE CASCADE,
  user_id    BIGINT  NOT NULL REFERENCES app_user(id)      ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (request_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_request_upvote_request
  ON request_upvote(request_id);

CREATE INDEX IF NOT EXISTS idx_request_upvote_user
  ON request_upvote(user_id, created_at DESC);
