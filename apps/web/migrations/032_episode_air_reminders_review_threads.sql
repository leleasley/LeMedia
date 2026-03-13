-- Migration: 032_episode_air_reminders_review_threads
-- Description: Add episode air reminder tracking and threaded review comments with mentions
-- Created: 2026-03-13

CREATE TABLE IF NOT EXISTS episode_air_reminder_sent (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  season_number INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  air_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, tmdb_id, season_number, episode_number, air_date)
);

CREATE INDEX IF NOT EXISTS idx_episode_air_reminder_sent_user_created
  ON episode_air_reminder_sent(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episode_air_reminder_sent_air_date
  ON episode_air_reminder_sent(air_date);

CREATE TABLE IF NOT EXISTS review_comment (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES user_review(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  parent_id BIGINT REFERENCES review_comment(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  edited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_comment_review_created
  ON review_comment(review_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_review_comment_parent
  ON review_comment(parent_id);
CREATE INDEX IF NOT EXISTS idx_review_comment_user
  ON review_comment(user_id);

CREATE TABLE IF NOT EXISTS review_comment_mention (
  id BIGSERIAL PRIMARY KEY,
  comment_id BIGINT NOT NULL REFERENCES review_comment(id) ON DELETE CASCADE,
  mentioned_user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_review_comment_mention_user
  ON review_comment_mention(mentioned_user_id, created_at DESC);
