-- Migration: 018_custom_lists
-- Description: Custom user lists with sharing support
-- Created: 2026-02-16

-- Custom lists table
CREATE TABLE IF NOT EXISTS custom_list (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  share_id UUID UNIQUE DEFAULT uuid_generate_v4(),
  cover_tmdb_id INTEGER,
  cover_media_type TEXT CHECK (cover_media_type IN ('movie', 'tv')),
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_list_user ON custom_list(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_list_share ON custom_list(share_id) WHERE is_public = TRUE;
CREATE INDEX IF NOT EXISTS idx_custom_list_public ON custom_list(is_public, updated_at DESC) WHERE is_public = TRUE;

-- Custom list items table
CREATE TABLE IF NOT EXISTS custom_list_item (
  id BIGSERIAL PRIMARY KEY,
  list_id BIGINT NOT NULL REFERENCES custom_list(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('movie', 'tv')),
  position INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(list_id, tmdb_id, media_type)
);

CREATE INDEX IF NOT EXISTS idx_custom_list_item_list ON custom_list_item(list_id, position);
CREATE INDEX IF NOT EXISTS idx_custom_list_item_media ON custom_list_item(media_type, tmdb_id);

-- Trigger to update item_count and updated_at on custom_list
CREATE OR REPLACE FUNCTION update_custom_list_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE custom_list 
    SET item_count = item_count + 1, updated_at = NOW() 
    WHERE id = NEW.list_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE custom_list 
    SET item_count = item_count - 1, updated_at = NOW() 
    WHERE id = OLD.list_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_custom_list_item_stats ON custom_list_item;
CREATE TRIGGER trg_custom_list_item_stats
AFTER INSERT OR DELETE ON custom_list_item
FOR EACH ROW
EXECUTE FUNCTION update_custom_list_stats();
