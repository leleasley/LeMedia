-- Operator-supplied TVDB link: an admin can bind a TMDB row to the *arr's TVDB series when the
-- two services split a show (Top Boy 2011 / 2019). Nullable; null means "use the TMDB mapping".
ALTER TABLE "Media" ADD COLUMN "tvdbLinkedAt" DATETIME;
