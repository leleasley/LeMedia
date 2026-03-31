-- Watch party features: online presence heartbeat, tiered chat moderation, host-driven playback sync

-- Feature: online presence heartbeat (green dot for viewers active within last 15s)
ALTER TABLE watch_party_participant
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Feature: tiered chat moderation (auto-mute after 3 blocked-language violations)
ALTER TABLE watch_party_participant
  ADD COLUMN IF NOT EXISTS warn_count INTEGER NOT NULL DEFAULT 0;

-- Feature: host-driven playback sync (pause all / seek all viewers)
ALTER TABLE watch_party
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS playback_position_seconds INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS playback_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS playback_updated_by BIGINT REFERENCES app_user(id);

CREATE INDEX IF NOT EXISTS idx_watch_party_participant_last_seen
  ON watch_party_participant(party_id, last_seen_at);
