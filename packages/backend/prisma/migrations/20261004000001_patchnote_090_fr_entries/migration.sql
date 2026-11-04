-- Follow-up to 20261004000000: the French "réellement regarder" filler lives in the
-- entries JSON (descFr), not in bodyFr, so the previous pass didn't reach it.
-- Scoped to version 0.9.0 and the exact source string; re-running is a no-op.

UPDATE "Patchnote" SET
  "entries" = REPLACE("entries",
    'ce que l''utilisateur peut réellement regarder',
    'ce que l''utilisateur peut regarder')
WHERE "version" = '0.9.0';
