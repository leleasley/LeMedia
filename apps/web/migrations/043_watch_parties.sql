-- Watch Parties

CREATE TABLE IF NOT EXISTS watch_party (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  tmdb_id INTEGER NOT NULL,
  media_title TEXT NOT NULL,
  party_name TEXT NOT NULL,
  host_user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  jellyfin_item_id TEXT,
  max_viewers INTEGER NOT NULL DEFAULT 10 CHECK (max_viewers > 0 AND max_viewers <= 10),
  chat_moderation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_language_filter_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'cancelled')),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_watch_party_media ON watch_party(media_type, tmdb_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_party_host ON watch_party(host_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS watch_party_participant (
  party_id UUID NOT NULL REFERENCES watch_party(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('host', 'member')),
  can_invite BOOLEAN NOT NULL DEFAULT FALSE,
  can_pause BOOLEAN NOT NULL DEFAULT FALSE,
  can_moderate_chat BOOLEAN NOT NULL DEFAULT FALSE,
  chat_muted BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (party_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_watch_party_participant_user ON watch_party_participant(user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS watch_party_invite (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_id UUID NOT NULL REFERENCES watch_party(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  invited_by_user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'revoked')),
  can_invite BOOLEAN NOT NULL DEFAULT FALSE,
  can_pause BOOLEAN NOT NULL DEFAULT FALSE,
  can_moderate_chat BOOLEAN NOT NULL DEFAULT FALSE,
  chat_muted BOOLEAN NOT NULL DEFAULT FALSE,
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_watch_party_invite_lookup ON watch_party_invite(party_id, user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS watch_party_join_request (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  party_id UUID NOT NULL REFERENCES watch_party(id) ON DELETE CASCADE,
  requester_user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  resolved_by_user_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_watch_party_join_request_lookup ON watch_party_join_request(party_id, requester_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS watch_party_message (
  id BIGSERIAL PRIMARY KEY,
  party_id UUID NOT NULL REFERENCES watch_party(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_watch_party_message_party ON watch_party_message(party_id, created_at DESC);

CREATE OR REPLACE FUNCTION touch_watch_party_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_watch_party_updated_at ON watch_party;
CREATE TRIGGER trg_watch_party_updated_at
BEFORE UPDATE ON watch_party
FOR EACH ROW
EXECUTE FUNCTION touch_watch_party_updated_at();
