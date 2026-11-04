-- Per-movie dedupe flags for digital-release notifications (null = not sent yet).
-- Backfilled rows stay NULL so the next digital_release_sync tick notifies them once.
ALTER TABLE "Media" ADD COLUMN "digitalDiscoveredNotifiedAt" DATETIME;
ALTER TABLE "Media" ADD COLUMN "digitalReleaseNotifiedAt" DATETIME;
