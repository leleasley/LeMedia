ALTER TABLE user_media_list
  DROP CONSTRAINT IF EXISTS user_media_list_list_type_check;

ALTER TABLE user_media_list
  ADD CONSTRAINT user_media_list_list_type_check
  CHECK (list_type IN ('favorite', 'watchlist', 'watched'));
