-- Add Jellyfin availability sync job
INSERT INTO jobs (name, schedule, interval_seconds, type, enabled, run_on_start)
VALUES ('jellyfin-availability-sync', '0 * * * *', 3600, 'system', true, false)
ON CONFLICT (name) DO NOTHING;
