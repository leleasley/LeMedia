-- Migration: 008_upgrade_finder_overrides
-- Description: store upgrade finder ignore flags
-- Created: 2026-01-23

CREATE TABLE IF NOT EXISTS upgrade_finder_override (
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  media_id INTEGER NOT NULL,
  ignore_4k BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (media_type, media_id)
);

CREATE INDEX IF NOT EXISTS idx_upgrade_finder_override_updated_at ON upgrade_finder_override(updated_at DESC);
