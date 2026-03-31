-- Watch party enhancements: slug routing, rate limits, chat colors, TV episode selection

ALTER TABLE watch_party
  ADD COLUMN IF NOT EXISTS party_slug TEXT,
  ADD COLUMN IF NOT EXISTS message_rate_limit_seconds INTEGER NOT NULL DEFAULT 15 CHECK (message_rate_limit_seconds >= 1 AND message_rate_limit_seconds <= 120),
  ADD COLUMN IF NOT EXISTS selected_season_number INTEGER,
  ADD COLUMN IF NOT EXISTS selected_episode_number INTEGER,
  ADD COLUMN IF NOT EXISTS selected_episode_title TEXT,
  ADD COLUMN IF NOT EXISTS selected_jellyfin_item_id TEXT;

ALTER TABLE watch_party_participant
  ADD COLUMN IF NOT EXISTS chat_color TEXT NOT NULL DEFAULT '#60A5FA';

-- Keep slugs deterministic and route-safe.
UPDATE watch_party
SET party_slug = lower(regexp_replace(trim(party_name), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE party_slug IS NULL OR trim(party_slug) = '';

UPDATE watch_party
SET party_slug = trim(both '-' from party_slug)
WHERE party_slug IS NOT NULL;

UPDATE watch_party
SET party_slug = concat('party-', replace(id::text, '-', ''))
WHERE party_slug IS NULL OR party_slug = '';

-- Resolve collisions by suffixing with a short id fragment.
WITH ranked AS (
  SELECT id,
         party_slug,
         ROW_NUMBER() OVER (PARTITION BY party_slug ORDER BY created_at ASC, id ASC) AS rn
  FROM watch_party
)
UPDATE watch_party wp
SET party_slug = concat(wp.party_slug, '-', substr(replace(wp.id::text, '-', ''), 1, 6))
FROM ranked r
WHERE wp.id = r.id AND r.rn > 1;

ALTER TABLE watch_party
  ALTER COLUMN party_slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_party_party_slug_unique ON watch_party(party_slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_watch_party_active_name_unique ON watch_party(lower(party_name)) WHERE status = 'active';
