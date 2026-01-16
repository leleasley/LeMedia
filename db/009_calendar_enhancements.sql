-- Calendar Enhancements Migration
-- Adds support for enhanced calendar features including:
-- - Release date tracking on requests
-- - Per-user calendar preferences
-- - Calendar event subscriptions for notifications

-- Add release_date to media_request for smart display
ALTER TABLE media_request ADD COLUMN IF NOT EXISTS release_date DATE;

-- Create index for date-based queries on release_date
CREATE INDEX IF NOT EXISTS idx_media_request_release_date
  ON media_request(release_date)
  WHERE release_date IS NOT NULL;

-- Calendar preferences (per-user settings)
CREATE TABLE IF NOT EXISTS calendar_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  default_view TEXT DEFAULT 'month' CHECK (default_view IN ('month', 'week', 'list', 'agenda')),
  filters JSONB DEFAULT '{"movies": true, "tv": true, "requests": true, "sonarr": true, "radarr": true}'::jsonb,
  genre_filters INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  monitored_only BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Calendar event subscriptions (for "notify when available")
CREATE TABLE IF NOT EXISTS calendar_event_subscription (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('movie_release', 'tv_premiere', 'tv_episode', 'season_premiere')),
  tmdb_id INTEGER NOT NULL,
  season_number INTEGER,
  episode_number INTEGER,
  notify_on_available BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, event_type, tmdb_id, season_number, episode_number)
);

-- Indexes for calendar_event_subscription
CREATE INDEX IF NOT EXISTS idx_calendar_subscription_user
  ON calendar_event_subscription(user_id, tmdb_id);

CREATE INDEX IF NOT EXISTS idx_calendar_subscription_notify
  ON calendar_event_subscription(notify_on_available)
  WHERE notify_on_available = true;
