-- Migration: 030_notified_seasons
-- Description: Table for tracking new season notifications to prevent duplicate alerts
-- Created: 2026-02-26

CREATE TABLE IF NOT EXISTS notified_season (
  request_id UUID NOT NULL REFERENCES media_request(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (request_id, season)
);

CREATE INDEX IF NOT EXISTS idx_notified_season_request_id ON notified_season(request_id);
