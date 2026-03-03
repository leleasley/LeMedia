-- Migration: 031_telegram_oauth_provider
-- Description: Allow Telegram as an OAuth account provider

ALTER TABLE user_oauth_account
  DROP CONSTRAINT IF EXISTS user_oauth_account_provider_check;

ALTER TABLE user_oauth_account
  ADD CONSTRAINT user_oauth_account_provider_check
  CHECK (provider IN ('google','github','telegram'));
