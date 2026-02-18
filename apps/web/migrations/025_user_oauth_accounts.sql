-- Migration: 025_user_oauth_accounts
-- Description: Add provider-linked OAuth accounts for Google/GitHub sign-in

CREATE TABLE IF NOT EXISTS user_oauth_account (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google','github')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  provider_login TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_user_id),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_oauth_account_user_id ON user_oauth_account(user_id);
CREATE INDEX IF NOT EXISTS idx_user_oauth_account_provider ON user_oauth_account(provider);
