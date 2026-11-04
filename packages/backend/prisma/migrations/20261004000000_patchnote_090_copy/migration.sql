-- Copy polish for the 0.9.0 patchnote (slop sweep): drop filler adverbs, split a colon
-- reveal into two sentences, and lead with the mechanism instead of narrating it.
-- Scoped to version 0.9.0 and exact source strings, so re-running is a no-op once applied.
-- French strings get the same treatment where the construction exists.

UPDATE "Patchnote" SET
  "entries" = REPLACE("entries",
    'which does not always match what a user can actually watch',
    'which does not always match what a user can watch'),
  "bodyEn" = REPLACE(REPLACE(REPLACE(REPLACE("bodyEn",
    'may not have scanned it yet: the user clicks, and there is nothing there.',
    'may not have scanned it yet. The user clicks, and there is nothing there.'),
    'And a series with only season 1 is no longer treated as complete: your users can ask for the seasons that are missing.',
    'A series with only season 1 is no longer treated as complete. Your users can ask for the seasons that are missing.'),
    '## Backups that actually restore',
    '## Backups that restore'),
    'LeMedia now says so clearly, with a button to review them and switch it on straight away.',
    'A button lets you review them and switch it on straight away.'),
  "bodyFr" = REPLACE(REPLACE(REPLACE(REPLACE("bodyFr",
    'ce que l''utilisateur peut réellement regarder',
    'ce que l''utilisateur peut regarder'),
    'LeMedia vous le dit maintenant clairement, avec un bouton pour les vérifier et l''activer dans la foulée.',
    'Un bouton permet de les vérifier et de l''activer dans la foulée.'),
    '## Des sauvegardes qui se restaurent vraiment',
    '## Des sauvegardes qui se restaurent'),
    'Et une série dont seule la saison 1 est là n''est plus considérée comme complète : vos utilisateurs peuvent demander les saisons qui manquent.',
    'Une série dont seule la saison 1 est là n''est plus considérée comme complète. Vos utilisateurs peuvent demander les saisons qui manquent.')
WHERE "version" = '0.9.0';
