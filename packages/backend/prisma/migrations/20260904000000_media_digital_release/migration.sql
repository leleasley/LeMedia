-- Media.digitalReleaseDate: TMDB digital release date (YYYY-MM-DD, release type 4 with
-- physical fallback). Hydrated on movie detail views and backfilled by the daily
-- digital_release_sync job. Existing rows stay NULL until either fills them in.
ALTER TABLE "Media" ADD COLUMN "digitalReleaseDate" TEXT;

CREATE INDEX "Media_digitalReleaseDate_idx" ON "Media"("digitalReleaseDate");
