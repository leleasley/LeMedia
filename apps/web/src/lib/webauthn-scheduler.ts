import "server-only";
import { cleanupExpiredChallenges, getWebAuthnStats } from "@/lib/webauthn-cleanup";
import { logger } from "@/lib/logger";

let cleanupInterval: NodeJS.Timeout | null = null;
const isBuildPhase =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-production-export";

/**
 * Start periodic cleanup of expired WebAuthn challenges
 * Runs every hour
 */
export function startWebAuthnCleanup() {
  if (cleanupInterval) {
    return; // Already running
  }
  
  // Run immediately on startup
  cleanupExpiredChallenges().catch(err => 
    logger.error("[WebAuthn Cleanup] Initial cleanup failed", err)
  );
  
  // Then run every hour
  cleanupInterval = setInterval(() => {
    cleanupExpiredChallenges().catch(err => 
      logger.error("[WebAuthn Cleanup] Failed", err)
    );
  }, 60 * 60 * 1000); // 1 hour
  
  logger.info("[WebAuthn Cleanup] Scheduled to run every hour");
}

/**
 * Stop the cleanup interval (for graceful shutdown)
 */
export function stopWebAuthnCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info("[WebAuthn Cleanup] Stopped");
  }
}

// Auto-start in production
if (process.env.NODE_ENV === "production" && !isBuildPhase) {
  startWebAuthnCleanup();
}

// Log stats on startup
if (process.env.NODE_ENV !== "test" && !isBuildPhase) {
  getWebAuthnStats().then(stats => {
    logger.info("[WebAuthn Stats]", {
      totalCredentials: stats.total_credentials,
      usersWithPasskeys: stats.users_with_passkeys,
      activeChallenges: stats.active_challenges,
      expiredChallenges: stats.expired_challenges
    });
  }).catch(() => {
    // Ignore if DB not ready yet
  });
}
