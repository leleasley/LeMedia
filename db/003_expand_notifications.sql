-- Expand notification types to support all Jellyseerr notification agents
ALTER TABLE notification_endpoint DROP CONSTRAINT IF EXISTS notification_endpoint_type_check;
ALTER TABLE notification_endpoint ADD CONSTRAINT notification_endpoint_type_check 
  CHECK (type IN ('telegram','discord','email','webhook','webpush','gotify','ntfy','pushbullet','pushover','slack'));

-- Add additional config fields that may be needed
-- The config JSONB column will store agent-specific settings
-- No schema changes needed, just ensuring the constraint allows new types
