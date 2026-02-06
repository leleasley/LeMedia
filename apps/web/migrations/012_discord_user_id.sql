-- Add discord_user_id column to app_user table
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS discord_user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_app_user_discord_user_id ON app_user(discord_user_id);
