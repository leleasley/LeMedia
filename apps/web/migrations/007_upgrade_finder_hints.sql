-- Migration: 007_upgrade_finder_hints
-- Description: store 4K upgrade hints for upgrade finder
-- Created: 2026-01-20

CREATE TABLE IF NOT EXISTS upgrade_finder_hint (
  media_type TEXT NOT NULL CHECK (media_type IN ('movie','tv')),
  media_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('available','none','error')),
  hint_text TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (media_type, media_id)
);

CREATE INDEX IF NOT EXISTS idx_upgrade_finder_hint_checked_at ON upgrade_finder_hint(checked_at DESC);
