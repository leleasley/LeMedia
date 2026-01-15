import { syncPendingRequests, syncWatchlists } from "./request-sync";
import { hasActiveMediaService } from "./media-services";
import { getPool } from "@/db";
import { logger } from "@/lib/logger";

const DEFAULT_INTERVAL_MINUTES = 5;
const MIN_INTERVAL_MINUTES = 1;
let initialized = false;
let startInProgress = false;

function parseInterval() {
  const raw = process.env.REQUEST_SYNC_INTERVAL_MINUTES;
  if (!raw) return DEFAULT_INTERVAL_MINUTES;
  const parsed = Number(raw);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_INTERVAL_MINUTES;
  return Math.max(parsed, MIN_INTERVAL_MINUTES);
}

const REQUEST_SYNC_LOCK_KEY = 991245; // Arbitrary, stable key for advisory lock

async function runSync() {
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      const lockRes = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock($1) as locked",
        [REQUEST_SYNC_LOCK_KEY]
      );
      const locked = lockRes.rows[0]?.locked;
      if (!locked) {
        return;
      }
      try {
        // Sync Watchlists first
        try {
            await syncWatchlists();
        } catch (e) {
            logger.error("[request-sync] Watchlist sync error", e);
        }

        const summary = await syncPendingRequests();
        if (summary.processed > 0) {
          console.info(
            `[request-sync] Synced ${summary.processed} request(s): available=${summary.available} downloading=${summary.downloading} removed=${summary.removed} errors=${summary.errors}`
          );
        }
      } finally {
        await client.query("SELECT pg_advisory_unlock($1)", [REQUEST_SYNC_LOCK_KEY]);
      }
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error("[request-sync] background sync failed", err);
  }
}

export function startRequestSyncJob() {
  if (typeof window !== "undefined") return;
  if (initialized || startInProgress) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if ((process.env.REQUEST_SYNC_DISABLED ?? "false").toLowerCase() === "true") return;

  startInProgress = true;
  (async () => {
    try {
      const [hasRadarr, hasSonarr] = await Promise.all([
        hasActiveMediaService("radarr"),
        hasActiveMediaService("sonarr")
      ]);
      if (!hasRadarr && !hasSonarr) return;

      initialized = true;
      runSync();

      const intervalMinutes = parseInterval();
      const intervalMs = intervalMinutes * 60 * 1000;
      const timer = setInterval(runSync, intervalMs);
      if (typeof timer.unref === "function") {
        timer.unref();
      }
    } finally {
      startInProgress = false;
    }
  })();
}
