CREATE TABLE IF NOT EXISTS custom_list_collaborator (
  list_id BIGINT NOT NULL REFERENCES custom_list(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'editor' CHECK (role IN ('editor', 'viewer')),
  invited_by_user_id BIGINT REFERENCES app_user(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (list_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_custom_list_collaborator_user
  ON custom_list_collaborator(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_list_collaborator_list
  ON custom_list_collaborator(list_id, created_at DESC);

CREATE OR REPLACE FUNCTION touch_custom_list_collaborator_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_custom_list_collaborator_updated_at ON custom_list_collaborator;
CREATE TRIGGER trg_custom_list_collaborator_updated_at
  BEFORE UPDATE ON custom_list_collaborator
  FOR EACH ROW
  EXECUTE FUNCTION touch_custom_list_collaborator_updated_at();