-- Add web_push_enabled preference to users
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS web_push_enabled BOOLEAN DEFAULT NULL;

-- Reset existing users to NULL so they get prompted
UPDATE app_user SET web_push_enabled = NULL WHERE web_push_enabled IS NOT NULL;

-- Create index for queries
CREATE INDEX IF NOT EXISTS idx_app_user_web_push_enabled ON app_user(web_push_enabled);

