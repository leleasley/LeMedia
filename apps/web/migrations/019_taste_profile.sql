-- Migration: 019_taste_profile
-- Description: User taste profiles and recommendation quiz system
-- Created: 2026-02-16

-- User taste profile for recommendation personalization
CREATE TABLE IF NOT EXISTS user_taste_profile (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE UNIQUE,
  
  -- Genre preferences (1-5 scale, null = not rated)
  genre_action INTEGER CHECK (genre_action BETWEEN 1 AND 5),
  genre_adventure INTEGER CHECK (genre_adventure BETWEEN 1 AND 5),
  genre_animation INTEGER CHECK (genre_animation BETWEEN 1 AND 5),
  genre_comedy INTEGER CHECK (genre_comedy BETWEEN 1 AND 5),
  genre_crime INTEGER CHECK (genre_crime BETWEEN 1 AND 5),
  genre_documentary INTEGER CHECK (genre_documentary BETWEEN 1 AND 5),
  genre_drama INTEGER CHECK (genre_drama BETWEEN 1 AND 5),
  genre_family INTEGER CHECK (genre_family BETWEEN 1 AND 5),
  genre_fantasy INTEGER CHECK (genre_fantasy BETWEEN 1 AND 5),
  genre_history INTEGER CHECK (genre_history BETWEEN 1 AND 5),
  genre_horror INTEGER CHECK (genre_horror BETWEEN 1 AND 5),
  genre_music INTEGER CHECK (genre_music BETWEEN 1 AND 5),
  genre_mystery INTEGER CHECK (genre_mystery BETWEEN 1 AND 5),
  genre_romance INTEGER CHECK (genre_romance BETWEEN 1 AND 5),
  genre_scifi INTEGER CHECK (genre_scifi BETWEEN 1 AND 5),
  genre_thriller INTEGER CHECK (genre_thriller BETWEEN 1 AND 5),
  genre_war INTEGER CHECK (genre_war BETWEEN 1 AND 5),
  genre_western INTEGER CHECK (genre_western BETWEEN 1 AND 5),
  
  -- Content preferences
  prefer_new_releases BOOLEAN,
  prefer_classics BOOLEAN,
  prefer_foreign BOOLEAN,
  prefer_indie BOOLEAN,
  min_rating DECIMAL(3,1) CHECK (min_rating BETWEEN 0 AND 10),
  
  -- Mood/viewing preferences
  mood_intense INTEGER CHECK (mood_intense BETWEEN 1 AND 5),
  mood_lighthearted INTEGER CHECK (mood_lighthearted BETWEEN 1 AND 5),
  mood_thoughtful INTEGER CHECK (mood_thoughtful BETWEEN 1 AND 5),
  mood_exciting INTEGER CHECK (mood_exciting BETWEEN 1 AND 5),
  
  -- Media type preference (movies vs tv)
  prefer_movies INTEGER CHECK (prefer_movies BETWEEN 1 AND 5),
  prefer_tv INTEGER CHECK (prefer_tv BETWEEN 1 AND 5),
  
  -- Runtime preferences
  prefer_short BOOLEAN,
  prefer_long BOOLEAN,
  
  -- JSON for extensibility (liked directors, actors, decades, etc.)
  extended_preferences JSONB DEFAULT '{}'::jsonb,
  
  -- Quiz completion tracking
  quiz_completed BOOLEAN NOT NULL DEFAULT FALSE,
  quiz_completed_at TIMESTAMPTZ,
  quiz_version INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_taste_profile_user ON user_taste_profile(user_id);
CREATE INDEX IF NOT EXISTS idx_user_taste_profile_quiz ON user_taste_profile(quiz_completed);

-- Quiz state for multi-step quiz persistence
CREATE TABLE IF NOT EXISTS user_quiz_state (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE UNIQUE,
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 12,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_quiz_state_user ON user_quiz_state(user_id);

-- Sample media for quiz (curated selection for taste assessment)
CREATE TABLE IF NOT EXISTS quiz_sample_media (
  id BIGSERIAL PRIMARY KEY,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  title TEXT NOT NULL,
  poster_path TEXT,
  genres JSONB NOT NULL DEFAULT '[]'::jsonb,
  release_year INTEGER,
  vote_average DECIMAL(3,1),
  question_category TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE(tmdb_id, media_type)
);

CREATE INDEX IF NOT EXISTS idx_quiz_sample_media_category ON quiz_sample_media(question_category, display_order) WHERE is_active = TRUE;
