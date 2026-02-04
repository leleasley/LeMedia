-- Migration: 010_user_api_tokens
-- Description: Per-user API tokens for external integrations
-- Created: 2026-02-04

CREATE TABLE IF NOT EXISTS user_api_token (
  user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  token_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_api_token_hash ON user_api_token(token_hash);
