-- Migration: 006_media_service_type_check
-- Description: update media_service type constraint to include new services
-- Created: 2026-01-20

ALTER TABLE media_service
  DROP CONSTRAINT IF EXISTS media_service_type_check;

ALTER TABLE media_service
  ADD CONSTRAINT media_service_type_check
  CHECK (type IN ('radarr','sonarr','prowlarr','sabnzbd','qbittorrent','nzbget'));
