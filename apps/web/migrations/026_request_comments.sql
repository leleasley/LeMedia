-- Migration: 026_request_comments
-- Description: Add request_comment table for threaded comments on media requests
-- Created: 2026-02-19

CREATE TABLE IF NOT EXISTS request_comment (
  id              BIGSERIAL PRIMARY KEY,
  request_id      UUID        NOT NULL REFERENCES media_request(id) ON DELETE CASCADE,
  user_id         BIGINT      NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  comment         TEXT        NOT NULL CHECK (char_length(comment) BETWEEN 1 AND 2000),
  is_admin_comment BOOLEAN    NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_request_comment_request_id ON request_comment(request_id);
CREATE INDEX IF NOT EXISTS idx_request_comment_user_id    ON request_comment(user_id);
