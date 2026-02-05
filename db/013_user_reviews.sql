-- User reviews and ratings
CREATE TABLE IF NOT EXISTS user_review (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  tmdb_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  spoiler BOOLEAN NOT NULL DEFAULT FALSE,
  title TEXT NOT NULL,
  poster_path TEXT,
  release_year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, media_type, tmdb_id)
);

CREATE INDEX IF NOT EXISTS idx_user_review_media ON user_review(media_type, tmdb_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_review_user ON user_review(user_id, created_at DESC);
