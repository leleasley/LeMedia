-- Migration to support comprehensive notification settings storage
-- This expands the notification_endpoint table to store all configuration
-- for each notification type (email, discord, telegram, webhook, etc.)

-- First, update the type constraint to include all notification types
ALTER TABLE notification_endpoint 
  DROP CONSTRAINT IF EXISTS notification_endpoint_type_check;

ALTER TABLE notification_endpoint 
  ADD CONSTRAINT notification_endpoint_type_check 
  CHECK (type IN ('email','discord','telegram','webhook','webpush','gotify','ntfy','pushbullet','pushover','slack'));

-- The config JSONB column will store type-specific settings:
-- 
-- EMAIL: {
--   "senderName": "LeMedia",
--   "senderAddress": "noreply@example.com",
--   "smtpHost": "smtp.example.com",
--   "smtpPort": 587,
--   "encryption": "tls",
--   "authUser": "username",
--   "authPass": "password",
--   "allowSelfSigned": false,
--   "pgpPrivateKey": "",
--   "pgpPassword": ""
-- }
--
-- DISCORD: {
--   "webhookUrl": "https://discord.com/api/webhooks/...",
--   "botUsername": "LeMedia",
--   "botAvatarUrl": "",
--   "enableMentions": false,
--   "roleId": ""
-- }
--
-- TELEGRAM: {
--   "botToken": "123456:ABC-DEF...",
--   "chatId": "-100123456789",
--   "messageThreadId": "",
--   "sendSilently": false
-- }
--
-- WEBHOOK: {
--   "webhookUrl": "https://example.com/webhook",
--   "authHeader": "",
--   "jsonPayload": "{\"text\": \"{{subject}}\"}"
-- }
--
-- WEBPUSH: {} (browser-based, subscription managed separately)
--
-- GOTIFY: {
--   "url": "https://gotify.example.com",
--   "token": "ABC123",
--   "priority": 5
-- }
--
-- NTFY: {
--   "url": "https://ntfy.sh",
--   "topic": "lemedia-notifications",
--   "priority": 3,
--   "authMethod": "none",
--   "username": "",
--   "password": "",
--   "token": ""
-- }
--
-- PUSHBULLET: {
--   "accessToken": "o.ABC123",
--   "channelTag": ""
-- }
--
-- PUSHOVER: {
--   "userKey": "ABC123",
--   "apiToken": "DEF456",
--   "priority": 0,
--   "sound": "pushover"
-- }
--
-- SLACK: {
--   "webhookUrl": "https://hooks.slack.com/services/...",
--   "botUsername": "LeMedia",
--   "botEmoji": ":bell:"
-- }

-- Add a types column to store which event types are enabled (bitfield)
ALTER TABLE notification_endpoint 
  ADD COLUMN IF NOT EXISTS types INTEGER NOT NULL DEFAULT 127;

-- Create an index on the types column for efficient filtering
CREATE INDEX IF NOT EXISTS idx_notification_endpoint_types 
  ON notification_endpoint(types);

-- Insert default admin notification endpoints if they don't exist
-- These will be used for global notifications
INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('Email Notifications', 'email', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;

INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('Discord Notifications', 'discord', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;

INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('Telegram Notifications', 'telegram', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;

INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('Webhook Notifications', 'webhook', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;

INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('WebPush Notifications', 'webpush', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;

INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('Gotify Notifications', 'gotify', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;

INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('Ntfy Notifications', 'ntfy', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;

INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('Pushbullet Notifications', 'pushbullet', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;

INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('Pushover Notifications', 'pushover', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;

INSERT INTO notification_endpoint (name, type, enabled, is_global, events, config, types)
VALUES 
  ('Slack Notifications', 'slack', false, true, '["request_pending","request_approved","request_denied","request_failed","request_already_exists","issue_reported","issue_comment"]'::jsonb, '{}'::jsonb, 127)
ON CONFLICT DO NOTHING;
