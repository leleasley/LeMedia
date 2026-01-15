import "server-only";
import { getPool } from "@/db";

/**
 * Clean up expired WebAuthn challenges
 * Should be called periodically (e.g., every hour)
 */
export async function cleanupExpiredChallenges() {
  const p = getPool();
  const result = await p.query(
    `DELETE FROM webauthn_challenge WHERE expires_at < NOW()`
  );
  if (result.rowCount && result.rowCount > 0) {
    console.log(`[WebAuthn] Cleaned up ${result.rowCount} expired challenges`);
  }
  return result.rowCount || 0;
}

/**
 * Get WebAuthn statistics
 */
export async function getWebAuthnStats() {
  const p = getPool();
  const stats = await p.query(`
    SELECT 
      (SELECT COUNT(*) FROM user_credential) as total_credentials,
      (SELECT COUNT(DISTINCT user_id) FROM user_credential) as users_with_passkeys,
      (SELECT COUNT(*) FROM webauthn_challenge WHERE expires_at > NOW()) as active_challenges,
      (SELECT COUNT(*) FROM webauthn_challenge WHERE expires_at < NOW()) as expired_challenges
  `);
  return stats.rows[0];
}
