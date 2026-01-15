-- Add cached TMDB metadata for requests to reduce repeated external lookups
ALTER TABLE media_request
  ADD COLUMN IF NOT EXISTS poster_path TEXT,
  ADD COLUMN IF NOT EXISTS backdrop_path TEXT,
  ADD COLUMN IF NOT EXISTS release_year INTEGER;
