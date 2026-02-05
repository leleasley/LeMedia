-- Letterboxd username per user
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS letterboxd_username TEXT;
CREATE INDEX IF NOT EXISTS idx_app_user_letterboxd_username ON app_user(letterboxd_username);
