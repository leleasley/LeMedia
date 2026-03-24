-- Migration: 039_request_priority
-- Description: Add request priority level for triage and sorting
-- Created: 2026-03-24

ALTER TABLE media_request
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high'));

CREATE INDEX IF NOT EXISTS idx_media_request_priority_created
  ON media_request(priority, created_at DESC);
