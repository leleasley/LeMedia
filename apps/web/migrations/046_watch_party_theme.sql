ALTER TABLE watch_party
  ADD COLUMN IF NOT EXISTS theme VARCHAR(20) NOT NULL DEFAULT 'void';

ALTER TABLE watch_party
  DROP CONSTRAINT IF EXISTS watch_party_theme_check;

ALTER TABLE watch_party
  ADD CONSTRAINT watch_party_theme_check
    CHECK (theme IN ('void', 'midnight', 'ember', 'forest', 'aurora', 'rose', 'gold',
                     'blood', 'crypt', 'neon', 'wasteland', 'inferno', 'phantasm'));
