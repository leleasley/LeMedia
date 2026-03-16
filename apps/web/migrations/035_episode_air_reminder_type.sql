-- Migration: 035_episode_air_reminder_type
-- Description: Support multiple pre-air reminder windows (e.g. 24h and 1h)
-- Created: 2026-03-13

ALTER TABLE episode_air_reminder_sent
  ADD COLUMN IF NOT EXISTS reminder_type TEXT NOT NULL DEFAULT 'pre24h';

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'episode_air_reminder_sent'::regclass
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) LIKE 'UNIQUE (user_id, tmdb_id, season_number, episode_number, air_date)%'
      AND pg_get_constraintdef(c.oid) NOT LIKE '%reminder_type%'
  LOOP
    EXECUTE format('ALTER TABLE episode_air_reminder_sent DROP CONSTRAINT %I', constraint_name);
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE episode_air_reminder_sent
  ADD CONSTRAINT episode_air_reminder_sent_unique_phase
  UNIQUE (user_id, tmdb_id, season_number, episode_number, air_date, reminder_type);
