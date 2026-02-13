import { syncPendingRequests, syncWatchlists } from "@/lib/request-sync";
import { logger } from "@/lib/logger";
import { sendWeeklyDigest } from "@/notifications/weekly-digest";
import { purgeExpiredSessions } from "@/db";
import { checkCalendarSubscriptions } from "@/lib/calendar-notifications";
import { syncJellyfinAvailability } from "@/lib/jellyfin-availability-sync";
import { syncPlexAvailability } from "@/lib/plex-availability-sync";
import { refreshUpgradeHintsForAll } from "@/lib/upgrade-finder";
import { syncProwlarrIndexers } from "@/lib/prowlarr-sync";
import { importLetterboxdReviews } from "@/lib/letterboxd";
import { createBackupArchive } from "@/lib/backups";
import { runSystemAlertChecks } from "@/lib/system-alerts";

export type JobHandler = () => Promise<void>;

export const jobHandlers: Record<string, JobHandler> = {
  "request-sync": async () => {
    logger.info("[Job] Starting request-sync");
    const summary = await syncPendingRequests();
    logger.info(`[Job] request-sync completed: ${summary.processed} processed, ${summary.downloading} downloading, ${summary.available} available`);
  },
  "watchlist-sync": async () => {
    logger.info("[Job] Starting watchlist-sync");
    const result = await syncWatchlists();
    logger.info(`[Job] watchlist-sync completed: ${result.createdCount} created, ${result.errors} errors`);
  },
  "weekly-digest": async () => {
    logger.info("[Job] Starting weekly-digest");
    await sendWeeklyDigest();
    logger.info("[Job] weekly-digest completed");
  },
  "session-cleanup": async () => {
    const removed = await purgeExpiredSessions();
    if (removed > 0) {
      logger.info(`[Job] session-cleanup removed ${removed} expired sessions`);
    }
  },
  "calendar-notifications": async () => {
    logger.info("[Job] Starting calendar-notifications");
    const result = await checkCalendarSubscriptions();
    logger.info(`[Job] calendar-notifications completed: ${result.checked} checked, ${result.notified} notified, ${result.errors} errors`);
  },
  "jellyfin-availability-sync": async () => {
    logger.info("[Job] Starting jellyfin-availability-sync");
    const result = await syncJellyfinAvailability();
    logger.info(`[Job] jellyfin-availability-sync completed: ${result.scanned} scanned, ${result.added} added, ${result.updated} updated`);
  },
  "plex-availability-sync": async () => {
    logger.info("[Job] Starting plex-availability-sync");
    const result = await syncPlexAvailability();
    logger.info(`[Job] plex-availability-sync completed: ${result.scanned} scanned, ${result.added} added, ${result.updated} updated`);
  },
  "upgrade-finder-4k": async () => {
    logger.info("[Job] Starting upgrade-finder-4k");
    const result = await refreshUpgradeHintsForAll();
    logger.info(`[Job] upgrade-finder-4k completed: ${result.processed} processed, ${result.available} available, ${result.errored} errors`);
  },
  "prowlarr-indexer-sync": async () => {
    logger.info("[Job] Starting prowlarr-indexer-sync");
    const result = await syncProwlarrIndexers();
    logger.info(`[Job] prowlarr-indexer-sync completed: created=${result.created} updated=${result.updated} synced=${result.synced}`);
  },
  "letterboxd-import": async () => {
    logger.info("[Job] Starting letterboxd-import");
    const result = await importLetterboxdReviews();
    logger.info(`[Job] letterboxd-import completed: imported=${result.imported} skipped=${result.skipped} errors=${result.errors}`);
  },
  "backup-snapshot": async () => {
    logger.info("[Job] Starting backup-snapshot");
    const result = await createBackupArchive({ trigger: "job" });
    logger.info(`[Job] backup-snapshot completed: ${result.name} (${result.sizeBytes} bytes), retention-removed=${result.retention.deleted.length}`);
  },
  "system-alerts": async () => {
    logger.info("[Job] Starting system-alerts");
    await runSystemAlertChecks();
    logger.info("[Job] system-alerts completed");
  },
};
