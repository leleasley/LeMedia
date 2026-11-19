-- Provenance for rows that do not come from an *arr (Zurg's own library), plus the WebDAV path
-- needed to delete the release from the debrid account.
ALTER TABLE "Media" ADD COLUMN "source" TEXT;
ALTER TABLE "Media" ADD COLUMN "zurgPath" TEXT;
