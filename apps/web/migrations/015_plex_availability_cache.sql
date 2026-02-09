-- Migration: 015_plex_availability_cache
-- Description: plex availability cache
-- Created: 2026-02-09

CREATE TABLE IF NOT EXISTS plex_availability (
  id SERIAL PRIMARY KEY,
  tmdb_id INTEGER,
  tvdb_id INTEGER,
  imdb_id TEXT,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','episode','season','series')),
  title TEXT,
  season_number INTEGER,
  episode_number INTEGER,
  air_date DATE,
  plex_item_id VARCHAR(100) NOT NULL,
  plex_library_id VARCHAR(100),
  last_scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plex_item_id)
);

CREATE INDEX IF NOT EXISTS idx_plex_movie_lookup
  ON plex_availability(tmdb_id, media_type);

CREATE INDEX IF NOT EXISTS idx_plex_series_lookup
  ON plex_availability(tmdb_id, tvdb_id, media_type);

CREATE INDEX IF NOT EXISTS idx_plex_episode_lookup
  ON plex_availability(tmdb_id, season_number, episode_number, media_type);

CREATE INDEX IF NOT EXISTS idx_plex_last_scanned
  ON plex_availability(last_scanned_at DESC);

CREATE TABLE IF NOT EXISTS plex_scan_log (
  id SERIAL PRIMARY KEY,
  library_id TEXT,
  library_name TEXT,
  items_scanned INTEGER NOT NULL DEFAULT 0,
  items_added INTEGER NOT NULL DEFAULT 0,
  items_removed INTEGER NOT NULL DEFAULT 0,
  scan_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scan_completed_at TIMESTAMPTZ,
  scan_status TEXT NOT NULL DEFAULT 'running' CHECK (scan_status IN ('running','completed','failed')),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_plex_scan_log_completed
  ON plex_scan_log(scan_completed_at DESC);
