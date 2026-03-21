-- Migration: 037_password_reset_token_viewed_at
-- Description: Adds viewed_at to password_reset_token for one-time reset-link exchange
-- Created: 2026-03-21

ALTER TABLE password_reset_token
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
