import { syncPendingRequests, syncWatchlists } from "@/lib/request-sync";
import { logger } from "@/lib/logger";
import { sendWeeklyDigest } from "@/notifications/weekly-digest";
import { purgeExpiredSessions } from "@/db";

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
};
