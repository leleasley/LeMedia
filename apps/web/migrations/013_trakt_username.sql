-- Add trakt_username column to app_user table
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS trakt_username TEXT;
CREATE INDEX IF NOT EXISTS idx_app_user_trakt_username ON app_user(trakt_username);
