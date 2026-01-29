-- Add permissions field for per-user access controls
ALTER TABLE app_user
ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;
