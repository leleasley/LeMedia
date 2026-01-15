import "server-only";
import { cleanupExpiredChallenges, getWebAuthnStats } from "@/lib/webauthn-cleanup";

let cleanupInterval: NodeJS.Timeout | null = null;

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
    console.error("[WebAuthn Cleanup] Initial cleanup failed:", err)
  );
  
  // Then run every hour
  cleanupInterval = setInterval(() => {
    cleanupExpiredChallenges().catch(err => 
      console.error("[WebAuthn Cleanup] Failed:", err)
    );
  }, 60 * 60 * 1000); // 1 hour
  
  console.log("[WebAuthn Cleanup] Scheduled to run every hour");
}

/**
 * Stop the cleanup interval (for graceful shutdown)
 */
export function stopWebAuthnCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log("[WebAuthn Cleanup] Stopped");
  }
}

// Auto-start in production
if (process.env.NODE_ENV === "production") {
  startWebAuthnCleanup();
}

// Log stats on startup
if (process.env.NODE_ENV !== "test") {
  getWebAuthnStats().then(stats => {
    console.log("[WebAuthn Stats]", {
      totalCredentials: stats.total_credentials,
      usersWithPasskeys: stats.users_with_passkeys,
      activeChallenges: stats.active_challenges,
      expiredChallenges: stats.expired_challenges
    });
  }).catch(() => {
    // Ignore if DB not ready yet
  });
}
