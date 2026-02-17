-- Migration: 020_custom_list_share_slug
-- Description: Add share_slug for custom list share URLs
-- Created: 2026-02-17

ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS share_slug TEXT;

-- Generate slugs for existing lists (dedupe by suffix)
WITH base AS (
  SELECT
    id,
    COALESCE(NULLIF(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), ''), 'list-' || id::text) AS slug
  FROM custom_list
),
dedup AS (
  SELECT
    id,
    slug,
    row_number() OVER (PARTITION BY slug ORDER BY id) AS rn
  FROM base
)
UPDATE custom_list
SET share_slug = CASE WHEN dedup.rn = 1 THEN dedup.slug ELSE dedup.slug || '-' || dedup.rn END
FROM dedup
WHERE custom_list.id = dedup.id
  AND custom_list.share_slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_list_share_slug ON custom_list(share_slug);
