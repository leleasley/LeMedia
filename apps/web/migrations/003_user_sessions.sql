-- Migration: 003_user_sessions
-- Description: Add user_session table for revocable sessions
-- Created: 2026-02-21

CREATE TABLE IF NOT EXISTS user_session (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  jti TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_user_session_user ON user_session(user_id);
CREATE INDEX IF NOT EXISTS idx_user_session_expires ON user_session(expires_at);
-- Avoid non-immutable predicates; expires_at filtering happens at query time.
CREATE INDEX IF NOT EXISTS idx_user_session_active ON user_session(jti) WHERE revoked_at IS NULL;
