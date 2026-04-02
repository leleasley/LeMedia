ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS calendar_assistant_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS calendar_assistant_channels TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS calendar_assistant_day_of_week SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS calendar_assistant_hour SMALLINT NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS calendar_assistant_last_sent_date DATE;

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS app_user_calendar_assistant_day_of_week_check;
ALTER TABLE app_user
  ADD CONSTRAINT app_user_calendar_assistant_day_of_week_check
  CHECK (calendar_assistant_day_of_week BETWEEN 0 AND 6);

ALTER TABLE app_user
  DROP CONSTRAINT IF EXISTS app_user_calendar_assistant_hour_check;
ALTER TABLE app_user
  ADD CONSTRAINT app_user_calendar_assistant_hour_check
  CHECK (calendar_assistant_hour BETWEEN 0 AND 23);

CREATE TABLE IF NOT EXISTS media_reaction (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id INTEGER NOT NULL,
  emoji VARCHAR(16) NOT NULL,
  worth_watching BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, media_type, tmdb_id)
);

CREATE INDEX IF NOT EXISTS idx_media_reaction_lookup
  ON media_reaction (media_type, tmdb_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_reaction_user
  ON media_reaction (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION set_media_reaction_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_media_reaction_updated_at ON media_reaction;
CREATE TRIGGER trg_media_reaction_updated_at
BEFORE UPDATE ON media_reaction
FOR EACH ROW
EXECUTE FUNCTION set_media_reaction_updated_at();
