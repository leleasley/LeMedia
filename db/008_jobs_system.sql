CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    schedule VARCHAR(50) NOT NULL DEFAULT '0 * * * *',
    interval_seconds INTEGER DEFAULT 3600,
    type VARCHAR(50) NOT NULL DEFAULT 'system',
    enabled BOOLEAN DEFAULT TRUE,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    run_on_start BOOLEAN DEFAULT FALSE
);

-- Insert default jobs
INSERT INTO jobs (name, schedule, interval_seconds, type, run_on_start)
VALUES 
    ('request-sync', '*/5 * * * *', 300, 'system', TRUE), -- Sync requests every 5 mins
    ('watchlist-sync', '0 * * * *', 3600, 'system', FALSE), -- Sync watchlist every hour
    ('prowlarr-indexer-sync', '*/5 * * * *', 300, 'system', TRUE) -- Sync Prowlarr indexers every 5 mins
ON CONFLICT (name) DO NOTHING;
