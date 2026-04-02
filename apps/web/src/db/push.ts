import { getPool } from "./core";


// ============================================
// Push Subscriptions
// ============================================

export async function savePushSubscription(input: {
  userId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO push_subscription (user_id, endpoint, p256dh, auth, user_agent, last_used_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, endpoint)
     DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, last_used_at = NOW()
     RETURNING id`,
    [input.userId, input.endpoint, input.p256dh, input.auth, input.userAgent ?? null]
  );
  return { id: res.rows[0].id as number };
}


export async function deletePushSubscription(userId: number, endpoint: string) {
  const p = getPool();
  await p.query(
    `DELETE FROM push_subscription WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint]
  );
}


export async function getUserPushSubscriptions(userId: number) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, endpoint, p256dh, auth, user_agent, created_at, last_used_at
     FROM push_subscription
     WHERE user_id = $1
     ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );
  return res.rows.map(r => ({
    id: r.id as number,
    endpoint: r.endpoint as string,
    keys: {
      p256dh: r.p256dh as string,
      auth: r.auth as string,
    },
    userAgent: r.user_agent as string | null,
    createdAt: r.created_at as string,
    lastUsedAt: r.last_used_at as string | null,
  }));
}


export async function updatePushSubscriptionLastUsed(subscriptionId: number) {
  const p = getPool();
  await p.query(
    `UPDATE push_subscription SET last_used_at = NOW() WHERE id = $1`,
    [subscriptionId]
  );
}

// Web Push Preferences
export async function getWebPushPreference(userId: number): Promise<boolean | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT web_push_enabled FROM app_user WHERE id = $1`,
    [userId]
  );
  return res.rows[0]?.web_push_enabled ?? null;
}


export async function setWebPushPreference(userId: number, enabled: boolean): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE app_user SET web_push_enabled = $1 WHERE id = $2`,
    [enabled, userId]
  );
}


export async function getWeeklyDigestPreference(userId: number): Promise<boolean | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT weekly_digest_opt_in FROM app_user WHERE id = $1`,
    [userId]
  );
  return res.rows[0]?.weekly_digest_opt_in ?? null;
}


export async function setWeeklyDigestPreference(userId: number, enabled: boolean): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE app_user SET weekly_digest_opt_in = $1 WHERE id = $2`,
    [enabled, userId]
  );
}


export async function listWeeklyDigestRecipients(): Promise<Array<{ id: number; email: string; username: string }>> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, email, username
     FROM app_user
     WHERE weekly_digest_opt_in = true
       AND email IS NOT NULL
       AND banned = false`
  );
  return res.rows.map((row) => ({
    id: Number(row.id),
    email: row.email,
    username: row.username
  }));
}
