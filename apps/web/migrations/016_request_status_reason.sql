-- Migration: 016_request_status_reason
-- Description: Add optional admin-visible reason on request status transitions
-- Created: 2026-02-16

ALTER TABLE media_request
  ADD COLUMN IF NOT EXISTS status_reason TEXT;

