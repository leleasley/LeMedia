-- Job execution history for tracking every run with result and duration
CREATE TABLE IF NOT EXISTS job_history (
    id SERIAL PRIMARY KEY,
    job_name VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success',  -- 'success' or 'failure'
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    error TEXT,
    details TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_history_job_name ON job_history(job_name);
CREATE INDEX IF NOT EXISTS idx_job_history_started_at ON job_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_history_job_name_started_at ON job_history(job_name, started_at DESC);

-- Auto-prune: keep only the last 500 entries per job to prevent unbounded growth
-- (handled in application code, this is just the schema)
