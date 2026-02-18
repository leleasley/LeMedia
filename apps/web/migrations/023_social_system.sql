-- Migration 023: Social System
-- Adds user profiles, friend graph, list visibility tiers, social events/feed,
-- list reactions, list comments, list saves/remixes, user blocks/reports, and rate limiting.

-- ============================================================
-- 1. USER PROFILE (bio, banner, privacy flags)
-- ============================================================
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS banner_url TEXT;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS profile_visibility TEXT NOT NULL DEFAULT 'public'
  CHECK (profile_visibility IN ('public', 'friends', 'private'));
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS show_activity BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS allow_friend_requests BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS show_stats BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS show_lists BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_app_user_username_trgm ON app_user USING btree (lower(username));

-- ============================================================
-- 2. FRIEND SYSTEM (request + edge + block)
-- ============================================================
CREATE TABLE IF NOT EXISTS friend_request (
  id BIGSERIAL PRIMARY KEY,
  from_user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  to_user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  UNIQUE(from_user_id, to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_request_to_user ON friend_request(to_user_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_request_from_user ON friend_request(from_user_id, status);

CREATE TABLE IF NOT EXISTS friend_edge (
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  friend_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, friend_id)
);
CREATE INDEX IF NOT EXISTS idx_friend_edge_friend ON friend_edge(friend_id);

CREATE TABLE IF NOT EXISTS user_block (
  blocker_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  blocked_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id)
);

-- ============================================================
-- 3. LIST VISIBILITY UPGRADE (replace boolean is_public)
-- ============================================================
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'
  CHECK (visibility IN ('private', 'friends', 'public'));
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS allow_comments BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS allow_reactions BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS allow_remix BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS comment_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE custom_list ADD COLUMN IF NOT EXISTS save_count INTEGER NOT NULL DEFAULT 0;

-- Migrate existing is_public to visibility
UPDATE custom_list SET visibility = CASE WHEN is_public THEN 'public' ELSE 'private' END
  WHERE visibility = 'private' AND is_public = TRUE;

CREATE INDEX IF NOT EXISTS idx_custom_list_visibility ON custom_list(visibility);
CREATE INDEX IF NOT EXISTS idx_custom_list_user_pinned ON custom_list(user_id, pinned DESC, updated_at DESC);

-- ============================================================
-- 4. LIST REACTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS list_reaction (
  id BIGSERIAL PRIMARY KEY,
  list_id BIGINT NOT NULL REFERENCES custom_list(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL DEFAULT 'like' CHECK (reaction IN ('like', 'love', 'fire', 'mindblown', 'clap')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(list_id, user_id, reaction)
);
CREATE INDEX IF NOT EXISTS idx_list_reaction_list ON list_reaction(list_id);
CREATE INDEX IF NOT EXISTS idx_list_reaction_user ON list_reaction(user_id);

-- ============================================================
-- 5. LIST COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS list_comment (
  id BIGSERIAL PRIMARY KEY,
  list_id BIGINT NOT NULL REFERENCES custom_list(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  parent_id BIGINT REFERENCES list_comment(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  edited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_list_comment_list ON list_comment(list_id, created_at);
CREATE INDEX IF NOT EXISTS idx_list_comment_user ON list_comment(user_id);
CREATE INDEX IF NOT EXISTS idx_list_comment_parent ON list_comment(parent_id);

-- ============================================================
-- 6. LIST SAVES / REMIXES
-- ============================================================
CREATE TABLE IF NOT EXISTS list_save (
  id BIGSERIAL PRIMARY KEY,
  original_list_id BIGINT NOT NULL REFERENCES custom_list(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  saved_list_id BIGINT REFERENCES custom_list(id) ON DELETE SET NULL,
  is_remix BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(original_list_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_list_save_user ON list_save(user_id);
CREATE INDEX IF NOT EXISTS idx_list_save_original ON list_save(original_list_id);

-- ============================================================
-- 7. SOCIAL EVENTS (feed fanout source)
-- ============================================================
CREATE TABLE IF NOT EXISTS social_event (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created_list', 'updated_list', 'added_item', 'hit_milestone',
    'liked_list', 'commented_list', 'saved_list', 'became_friends'
  )),
  target_type TEXT, -- 'list', 'user', 'item'
  target_id BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  visibility TEXT NOT NULL DEFAULT 'friends' CHECK (visibility IN ('friends', 'public')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_event_user ON social_event(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_event_created ON social_event(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_event_type ON social_event(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_event_visibility ON social_event(visibility, created_at DESC);

-- ============================================================
-- 8. USER REPORTS
-- ============================================================
CREATE TABLE IF NOT EXISTS user_report (
  id BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reported_user_id BIGINT REFERENCES app_user(id) ON DELETE CASCADE,
  reported_list_id BIGINT REFERENCES custom_list(id) ON DELETE CASCADE,
  reported_comment_id BIGINT REFERENCES list_comment(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  reviewed_by BIGINT REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_report_status ON user_report(status, created_at DESC);

-- ============================================================
-- 9. RATE LIMITING
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_user_action ON rate_limit_log(user_id, action, created_at DESC);

-- ============================================================
-- 10. TRIGGERS FOR DENORMALIZED COUNTERS
-- ============================================================

-- Like count trigger
CREATE OR REPLACE FUNCTION update_list_like_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.reaction = 'like' THEN
    UPDATE custom_list SET like_count = like_count + 1 WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' AND OLD.reaction = 'like' THEN
    UPDATE custom_list SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.list_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_list_like_count ON list_reaction;
CREATE TRIGGER trg_list_like_count
  AFTER INSERT OR DELETE ON list_reaction
  FOR EACH ROW EXECUTE FUNCTION update_list_like_count();

-- Comment count trigger
CREATE OR REPLACE FUNCTION update_list_comment_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE custom_list SET comment_count = comment_count + 1 WHERE id = NEW.list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE custom_list SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.list_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_list_comment_count ON list_comment;
CREATE TRIGGER trg_list_comment_count
  AFTER INSERT OR DELETE ON list_comment
  FOR EACH ROW EXECUTE FUNCTION update_list_comment_count();

-- Save count trigger
CREATE OR REPLACE FUNCTION update_list_save_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE custom_list SET save_count = save_count + 1 WHERE id = NEW.original_list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE custom_list SET save_count = GREATEST(save_count - 1, 0) WHERE id = OLD.original_list_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_list_save_count ON list_save;
CREATE TRIGGER trg_list_save_count
  AFTER INSERT OR DELETE ON list_save
  FOR EACH ROW EXECUTE FUNCTION update_list_save_count();
