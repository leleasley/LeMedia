ALTER TABLE jellyfin_availability
ADD COLUMN IF NOT EXISTS air_date DATE;

CREATE INDEX IF NOT EXISTS idx_jellyfin_episode_air_date
ON jellyfin_availability(tmdb_id, air_date)
WHERE media_type = 'episode';
