import { syncNewSeasonsAutoRequests, syncPendingRequests, syncWatchlists } from "@/lib/request-sync";
import { logger } from "@/lib/logger";
import { sendWeeklyDigest } from "@/notifications/weekly-digest";
import { autoExpirePendingRequests, getSetting, getSettingInt, purgeExpiredSessions } from "@/db";
import { notifyRequestEvent } from "@/notifications/request-events";
import { syncJellyfinAvailability } from "@/lib/jellyfin-availability-sync";
import { syncPlexAvailability } from "@/lib/plex-availability-sync";
import { refreshUpgradeHintsForAll } from "@/lib/upgrade-finder";
import { syncProwlarrIndexers } from "@/lib/prowlarr-sync";
import { importLetterboxdReviews } from "@/lib/letterboxd";
import { createBackupArchive } from "@/lib/backups";
import { runSystemAlertChecks } from "@/lib/system-alerts";
import { sendTelegramAdminDigestJob } from "@/lib/jobs/telegram-admin-digest";
import { sendFollowedMediaReleaseNotificationsJob } from "@/lib/jobs/followed-media-release-notifications";
import { sendEpisodeAirRemindersJob } from "@/lib/jobs/episode-air-reminders";
import { sendCalendarAssistantJob } from "@/lib/jobs/calendar-assistant";

export type JobHandler = () => Promise<string | void>;

export const jobHandlers: Record<string, JobHandler> = {
  "request-sync": async () => {
    const rawAutoExpiryEnabled = await getSetting("request.auto_expiry_enabled");
    const autoExpiryEnabled = rawAutoExpiryEnabled === "1" || rawAutoExpiryEnabled === "true";
    let expiredCount = 0;
    let expiryDays = 0;
    if (autoExpiryEnabled) {
      expiryDays = Math.max(1, await getSettingInt("request.auto_expiry_days", 14));
      const expiredRequests = await autoExpirePendingRequests({ olderThanDays: expiryDays });
      expiredCount = expiredRequests.length;
      await Promise.all(
        expiredRequests.map((request) =>
          notifyRequestEvent("request_denied", {
            requestId: request.id,
            requestType: request.request_type,
            tmdbId: request.tmdb_id,
            title: request.title,
            username: request.username,
            userId: request.user_id,
            statusReason: request.status_reason,
          }).catch((error) => {
            logger.warn("[Job] Failed to notify auto-expired request", {
              requestId: request.id,
              error: error instanceof Error ? error.message : String(error),
            });
          })
        )
      );
    }

    const summary = await syncPendingRequests();
    const autoExpirySuffix = autoExpiryEnabled
      ? `, ${expiredCount} auto-expired (> ${expiryDays}d)`
      : ", auto-expiry disabled";
    const msg = `${summary.processed} processed, ${summary.downloading} downloading, ${summary.available} available${autoExpirySuffix}`;
    logger.info(`[Job] request-sync completed: ${msg}`);
    return msg;
  },
  "watchlist-sync": async () => {
    const result = await syncWatchlists();
    const msg = `${result.createdCount} created, ${result.errors} errors`;
    logger.info(`[Job] watchlist-sync completed: ${msg}`);
    return msg;
  },
  "new-season-notifications": async () => {
    const result = await syncNewSeasonsAutoRequests();
    const msg = `${result.processed} checked, ${result.added} notified, ${result.errors} errors`;
    logger.info(`[Job] new-season-notifications completed: ${msg}`);
    return msg;
  },
  "weekly-digest": async () => {
    await sendWeeklyDigest();
    logger.info("[Job] weekly-digest completed");
    return "Digest sent";
  },
  "session-cleanup": async () => {
    const removed = await purgeExpiredSessions();
    const msg = `${removed} expired sessions removed`;
    if (removed > 0) {
      logger.info(`[Job] session-cleanup: ${msg}`);
    }
    return msg;
  },

  "jellyfin-availability-sync": async () => {
    const result = await syncJellyfinAvailability();
    const msg = `${result.scanned} scanned, ${result.added} added, ${result.updated} updated`;
    logger.info(`[Job] jellyfin-availability-sync completed: ${msg}`);
    return msg;
  },
  "plex-availability-sync": async () => {
    const result = await syncPlexAvailability();
    const msg = `${result.scanned} scanned, ${result.added} added, ${result.updated} updated`;
    logger.info(`[Job] plex-availability-sync completed: ${msg}`);
    return msg;
  },
  "upgrade-finder-4k": async () => {
    const result = await refreshUpgradeHintsForAll();
    const msg = `${result.processed} processed, ${result.available} available, ${result.errored} errors`;
    logger.info(`[Job] upgrade-finder-4k completed: ${msg}`);
    return msg;
  },
  "prowlarr-indexer-sync": async () => {
    const result = await syncProwlarrIndexers();
    const msg = `created=${result.created} updated=${result.updated} synced=${result.synced}`;
    logger.info(`[Job] prowlarr-indexer-sync completed: ${msg}`);
    return msg;
  },
  "letterboxd-import": async () => {
    const result = await importLetterboxdReviews();
    const msg = `imported=${result.imported} skipped=${result.skipped} errors=${result.errors}`;
    logger.info(`[Job] letterboxd-import completed: ${msg}`);
    return msg;
  },
  "backup-snapshot": async () => {
    const result = await createBackupArchive({ trigger: "job" });
    const msg = `${result.name} (${result.sizeBytes} bytes), retention-removed=${result.retention.deleted.length}`;
    logger.info(`[Job] backup-snapshot completed: ${msg}`);
    return msg;
  },
  "system-alerts": async () => {
    await runSystemAlertChecks();
    logger.info("[Job] system-alerts completed");
    return "Checks completed";
  },
  "telegram-admin-digest": async () => {
    const result = await sendTelegramAdminDigestJob();
    logger.info(`[Job] telegram-admin-digest completed: ${result}`);
    return result;
  },
  "followed-media-release-notifications": async () => {
    const result = await sendFollowedMediaReleaseNotificationsJob();
    logger.info(`[Job] followed-media-release-notifications completed: ${result}`);
    return result;
  },
  "calendar-assistant": async () => {
    const result = await sendCalendarAssistantJob();
    logger.info(`[Job] calendar-assistant completed: ${result}`);
    return result;
  },
  "episode-air-reminders": async () => {
    const result = await sendEpisodeAirRemindersJob();
    logger.info(`[Job] episode-air-reminders completed: ${result}`);
    return result;
  },
};
