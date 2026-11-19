-- Zurg's own view of a title, kept separate from the *arr-reported availability.
ALTER TABLE "Media" ADD COLUMN "zurgAddedAt" DATETIME;
ALTER TABLE "Media" ADD COLUMN "zurgSeasons" TEXT;
ALTER TABLE "Media" ADD COLUMN "zurgInventoryAt" DATETIME;
