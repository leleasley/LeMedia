-- Jellyfin Availability Cache
-- Stores what content is available in Jellyfin to avoid slow per-item API calls

CREATE TABLE IF NOT EXISTS jellyfin_availability (
    id SERIAL PRIMARY KEY,
    -- External IDs for matching
    tmdb_id INTEGER,
    tvdb_id INTEGER,
    imdb_id VARCHAR(20),

    -- Content identification
    media_type VARCHAR(10) NOT NULL CHECK (media_type IN ('movie', 'episode', 'season', 'series')),
    title VARCHAR(500),

    -- For episodes/seasons
    season_number INTEGER,
    episode_number INTEGER,

    -- Jellyfin data
    jellyfin_item_id VARCHAR(100) NOT NULL,
    jellyfin_library_id VARCHAR(100),

    -- Metadata
    last_scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Indexes for fast lookups
    UNIQUE(jellyfin_item_id)
);

-- Index for movie lookups
CREATE INDEX IF NOT EXISTS idx_jellyfin_movie_lookup
ON jellyfin_availability(tmdb_id, media_type)
WHERE media_type = 'movie';

-- Index for series lookups
CREATE INDEX IF NOT EXISTS idx_jellyfin_series_lookup
ON jellyfin_availability(tmdb_id, tvdb_id, media_type)
WHERE media_type IN ('series', 'season', 'episode');

-- Index for episode lookups (most common query)
CREATE INDEX IF NOT EXISTS idx_jellyfin_episode_lookup
ON jellyfin_availability(tmdb_id, season_number, episode_number, media_type)
WHERE media_type = 'episode';

-- Index for scan operations
CREATE INDEX IF NOT EXISTS idx_jellyfin_last_scanned
ON jellyfin_availability(last_scanned_at DESC);

-- Track when libraries were last scanned
CREATE TABLE IF NOT EXISTS jellyfin_scan_log (
    id SERIAL PRIMARY KEY,
    library_id VARCHAR(100),
    library_name VARCHAR(255),
    items_scanned INTEGER NOT NULL DEFAULT 0,
    items_added INTEGER NOT NULL DEFAULT 0,
    items_removed INTEGER NOT NULL DEFAULT 0,
    scan_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scan_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    scan_status VARCHAR(20) DEFAULT 'completed' CHECK (scan_status IN ('running', 'completed', 'failed')),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_jellyfin_scan_log_completed
ON jellyfin_scan_log(scan_completed_at DESC);

-- Function to clean up old availability data (optional - can be called periodically)
CREATE OR REPLACE FUNCTION cleanup_old_jellyfin_availability() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Remove items not seen in last 30 days (they might have been deleted from Jellyfin)
    DELETE FROM jellyfin_availability
    WHERE last_scanned_at < NOW() - INTERVAL '30 days';

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
