-- Migration: 024_custom_list_visibility_sync
-- Description: Keep legacy is_public and new visibility fields in sync
-- Created: 2026-02-18

-- If a list was made public through legacy APIs, ensure social visibility matches.
UPDATE custom_list
SET visibility = 'public'
WHERE is_public = TRUE
  AND visibility = 'private';

-- Keep legacy boolean aligned to canonical visibility values.
UPDATE custom_list
SET is_public = TRUE
WHERE visibility = 'public'
  AND is_public = FALSE;

UPDATE custom_list
SET is_public = FALSE
WHERE visibility <> 'public'
  AND is_public = TRUE;
