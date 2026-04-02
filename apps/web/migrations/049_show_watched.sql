-- Adds show_watched column for profile privacy control over watched history
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS show_watched BOOLEAN NOT NULL DEFAULT TRUE;
