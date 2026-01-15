-- Performance optimization migration: Add critical indexes
-- This migration adds indexes on frequently-queried columns for media lookups
-- Expected performance impact: 10-100x faster queries for search, discovery, and collection status checks

-- Add tmdb_id index to media_request for faster movie/tv lookups
CREATE INDEX IF NOT EXISTS idx_media_request_tmdb_id ON media_request(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_media_request_status ON media_request(status);

-- Composite index for common lookups: "find requests for movie/tv with specific statuses"
CREATE INDEX IF NOT EXISTS idx_media_request_type_status ON media_request(request_type, status);
CREATE INDEX IF NOT EXISTS idx_media_request_tmdb_status ON media_request(tmdb_id, status);

-- Composite index for user request lookups
CREATE INDEX IF NOT EXISTS idx_media_request_user_status ON media_request(requested_by, status);

-- Add title index for searching media
CREATE INDEX IF NOT EXISTS idx_media_request_title ON media_request(title);

-- Add status index to request_item for provider filtering
CREATE INDEX IF NOT EXISTS idx_request_item_status ON request_item(status);
CREATE INDEX IF NOT EXISTS idx_request_item_provider ON request_item(provider);

-- Composite for provider lookups
CREATE INDEX IF NOT EXISTS idx_request_item_provider_id ON request_item(provider, provider_id);

-- Add media_issue tmdb indexes for duplicate/issue checking
CREATE INDEX IF NOT EXISTS idx_media_issue_tmdb_id ON media_issue(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_media_issue_status ON media_issue(status);

-- Composite for issue lookups
CREATE INDEX IF NOT EXISTS idx_media_issue_tmdb_status ON media_issue(tmdb_id, status);

-- Add user indexes for activity tracking
CREATE INDEX IF NOT EXISTS idx_app_user_created_at ON app_user(created_at);
CREATE INDEX IF NOT EXISTS idx_app_user_last_seen_at ON app_user(last_seen_at);

-- Performance for notification lookups
CREATE INDEX IF NOT EXISTS idx_user_notification_endpoint_endpoint_id ON user_notification_endpoint(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_notification_endpoint_created_at ON notification_endpoint(created_at);
