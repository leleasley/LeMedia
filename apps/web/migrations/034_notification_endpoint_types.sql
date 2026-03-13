-- Migration: 034_notification_endpoint_types
-- Description: Widen notification endpoint type constraint for additional providers
-- Created: 2026-03-13

ALTER TABLE notification_endpoint
  DROP CONSTRAINT IF EXISTS notification_endpoint_type_check;

ALTER TABLE notification_endpoint
  ADD CONSTRAINT notification_endpoint_type_check
  CHECK (type IN ('telegram','discord','email','webhook','webpush','gotify','ntfy','pushbullet','pushover','slack'));