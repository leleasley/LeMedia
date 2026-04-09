CREATE TABLE IF NOT EXISTS review_reaction (
  review_id BIGINT NOT NULL REFERENCES user_review(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('helpful')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (review_id, user_id, reaction)
);

CREATE INDEX IF NOT EXISTS idx_review_reaction_review ON review_reaction(review_id, reaction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_reaction_user ON review_reaction(user_id, created_at DESC);