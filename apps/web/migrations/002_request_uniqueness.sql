-- Migration: 002_request_uniqueness
-- Description: Enforce one active request per movie and clean up duplicates
-- Created: 2026-02-21

-- Downgrade any duplicate active movie requests to a non-active status so the unique index can be created safely.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY request_type, tmdb_id ORDER BY created_at ASC) AS rn
  FROM media_request
  WHERE request_type = 'movie'
    AND status IN ('queued','pending','submitted')
)
UPDATE media_request
SET status = 'failed'
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Enforce uniqueness for active movie requests
CREATE UNIQUE INDEX IF NOT EXISTS ux_media_request_active_movie
  ON media_request (request_type, tmdb_id)
  WHERE request_type = 'movie' AND status IN ('queued','pending','submitted');
