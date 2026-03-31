import { randomUUID } from "crypto";
import { getPool } from "@/db";

export type UserSessionSummary = {
  id: string;
  jti: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  deviceId: string | null;
  deviceNickname: string | null;
  trustedAt: string | null;
  deviceFirstSeenAt: string | null;
  deviceLastSeenAt: string | null;
  deviceLastIpAddress: string | null;
  devicePreviousIpAddress: string | null;
  deviceLastIpChangedAt: string | null;
  suspiciousNetwork: boolean;
};

export type AdminSessionSummary = {
  userId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  jellyfinUserId: string | null;
  jti: string;
  expiresAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  ipAddress: string | null;
  deviceId: string | null;
  deviceNickname: string | null;
  trustedAt: string | null;
  suspiciousNetwork: boolean;
};

export type UserDeviceSummary = {
  deviceId: string;
  nickname: string | null;
  trustedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  firstIpAddress: string | null;
  lastIpAddress: string | null;
  previousIpAddress: string | null;
  lastIpChangedAt: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  suspiciousNetwork: boolean;
};

type SessionMeta = {
  userAgent?: string | null;
  deviceLabel?: string | null;
  ipAddress?: string | null;
  deviceId?: string | null;
};

async function upsertUserDevice(userId: number, meta?: SessionMeta): Promise<{ suspiciousNetwork: boolean }> {
  const deviceId = meta?.deviceId?.trim();
  if (!deviceId) return { suspiciousNetwork: false };

  const p = getPool();
  const res = await p.query(
    `INSERT INTO user_device (
       user_id,
       device_id,
       first_ip_address,
       last_ip_address,
       user_agent,
       device_label
     )
     VALUES ($1, $2, $3, $3, $4, $5)
     ON CONFLICT (user_id, device_id)
     DO UPDATE SET
       last_seen_at = NOW(),
       user_agent = COALESCE(EXCLUDED.user_agent, user_device.user_agent),
       device_label = COALESCE(EXCLUDED.device_label, user_device.device_label),
       previous_ip_address = CASE
         WHEN EXCLUDED.last_ip_address IS NOT NULL
           AND user_device.last_ip_address IS DISTINCT FROM EXCLUDED.last_ip_address
         THEN user_device.last_ip_address
         ELSE user_device.previous_ip_address
       END,
       last_ip_address = COALESCE(EXCLUDED.last_ip_address, user_device.last_ip_address),
       last_ip_changed_at = CASE
         WHEN EXCLUDED.last_ip_address IS NOT NULL
           AND user_device.last_ip_address IS DISTINCT FROM EXCLUDED.last_ip_address
         THEN NOW()
         ELSE user_device.last_ip_changed_at
       END
     RETURNING trusted_at as "trustedAt",
               previous_ip_address as "previousIpAddress",
               last_ip_address as "lastIpAddress",
               last_ip_changed_at as "lastIpChangedAt"`,
    [userId, deviceId, meta?.ipAddress ?? null, meta?.userAgent ?? null, meta?.deviceLabel ?? null]
  );

  const row = res.rows[0];
  const suspiciousNetwork = Boolean(
    row?.trustedAt &&
      row?.previousIpAddress &&
      row?.lastIpAddress &&
      row.previousIpAddress !== row.lastIpAddress &&
      row?.lastIpChangedAt
  );
  return { suspiciousNetwork };
}

export async function createUserSession(
  userId: number,
  jti: string,
  expiresAt: Date,
  meta?: SessionMeta
): Promise<{ suspiciousNetwork: boolean }> {
  const p = getPool();
  await p.query(
    `INSERT INTO user_session (id, user_id, jti, expires_at, user_agent, device_label, ip_address, device_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (jti) DO NOTHING`,
    [
      randomUUID(),
      userId,
      jti,
      expiresAt.toISOString(),
      meta?.userAgent ?? null,
      meta?.deviceLabel ?? null,
      meta?.ipAddress ?? null,
      meta?.deviceId ?? null,
    ]
  );
  return upsertUserDevice(userId, meta);
}

export async function touchUserSession(jti: string, sessionMaxAge?: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    sessionMaxAge && sessionMaxAge > 0
      ? `UPDATE user_session
         SET last_seen_at = NOW(),
             expires_at = NOW() + ($2 * INTERVAL '1 second')
         WHERE jti = $1
           AND revoked_at IS NULL
           AND expires_at > NOW()
         RETURNING user_id as "userId", device_id as "deviceId"`
      : `UPDATE user_session
         SET last_seen_at = NOW()
         WHERE jti = $1
           AND revoked_at IS NULL
           AND expires_at > NOW()
         RETURNING user_id as "userId", device_id as "deviceId"`,
    sessionMaxAge && sessionMaxAge > 0 ? [jti, sessionMaxAge] : [jti]
  );

  const row = res.rows[0];
  if (row?.userId && row?.deviceId) {
    await p.query(
      `UPDATE user_device
       SET last_seen_at = NOW()
       WHERE user_id = $1 AND device_id = $2`,
      [row.userId, row.deviceId]
    );
  }

  return Number(res.rowCount ?? 0) > 0;
}

export async function isSessionActive(jti: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `SELECT 1 FROM user_session WHERE jti = $1 AND revoked_at IS NULL AND expires_at > NOW() LIMIT 1`,
    [jti]
  );
  return Number(res.rowCount ?? 0) > 0;
}

export async function listUserSessions(userId: number): Promise<UserSessionSummary[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT us.id,
            us.jti,
            us.expires_at as "expiresAt",
            us.revoked_at as "revokedAt",
            us.last_seen_at as "lastSeenAt",
            us.user_agent as "userAgent",
            us.device_label as "deviceLabel",
            us.ip_address as "ipAddress",
            us.device_id as "deviceId",
            ud.nickname as "deviceNickname",
            ud.trusted_at as "trustedAt",
            ud.first_seen_at as "deviceFirstSeenAt",
            ud.last_seen_at as "deviceLastSeenAt",
            ud.last_ip_address as "deviceLastIpAddress",
            ud.previous_ip_address as "devicePreviousIpAddress",
            ud.last_ip_changed_at as "deviceLastIpChangedAt",
            (ud.trusted_at IS NOT NULL
              AND ud.previous_ip_address IS NOT NULL
              AND ud.last_ip_address IS DISTINCT FROM ud.previous_ip_address
              AND ud.last_ip_changed_at >= NOW() - INTERVAL '7 days') as "suspiciousNetwork"
     FROM user_session us
     LEFT JOIN user_device ud
       ON ud.user_id = us.user_id
      AND ud.device_id = us.device_id
     WHERE us.user_id = $1
     ORDER BY us.last_seen_at DESC NULLS LAST, us.expires_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function listUserDevices(userId: number): Promise<UserDeviceSummary[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT device_id as "deviceId",
            nickname,
            trusted_at as "trustedAt",
            first_seen_at as "firstSeenAt",
            last_seen_at as "lastSeenAt",
            first_ip_address as "firstIpAddress",
            last_ip_address as "lastIpAddress",
            previous_ip_address as "previousIpAddress",
            last_ip_changed_at as "lastIpChangedAt",
            user_agent as "userAgent",
            device_label as "deviceLabel",
            (trusted_at IS NOT NULL
              AND previous_ip_address IS NOT NULL
              AND last_ip_address IS DISTINCT FROM previous_ip_address
              AND last_ip_changed_at >= NOW() - INTERVAL '7 days') as "suspiciousNetwork"
     FROM user_device
     WHERE user_id = $1
     ORDER BY last_seen_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function updateUserDevicePreferences(
  userId: number,
  deviceId: string,
  updates: { nickname?: string | null; trusted?: boolean }
): Promise<UserDeviceSummary | null> {
  const p = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (updates.nickname !== undefined) {
    sets.push(`nickname = $${index++}`);
    values.push(updates.nickname ? String(updates.nickname).trim() : null);
  }
  if (updates.trusted !== undefined) {
    sets.push(`trusted_at = ${updates.trusted ? "NOW()" : "NULL"}`);
  }
  if (sets.length === 0) {
    const rows = await listUserDevices(userId);
    return rows.find((row) => row.deviceId === deviceId) ?? null;
  }

  values.push(userId, deviceId);
  const userIdParamIndex = values.length - 1;
  const deviceIdParamIndex = values.length;
  let res = await p.query(
    `UPDATE user_device
     SET ${sets.join(", ")}
     WHERE user_id = $${userIdParamIndex} AND device_id = $${deviceIdParamIndex}
     RETURNING device_id as "deviceId",
               nickname,
               trusted_at as "trustedAt",
               first_seen_at as "firstSeenAt",
               last_seen_at as "lastSeenAt",
               first_ip_address as "firstIpAddress",
               last_ip_address as "lastIpAddress",
               previous_ip_address as "previousIpAddress",
               last_ip_changed_at as "lastIpChangedAt",
               user_agent as "userAgent",
               device_label as "deviceLabel",
               (trusted_at IS NOT NULL
                 AND previous_ip_address IS NOT NULL
                 AND last_ip_address IS DISTINCT FROM previous_ip_address
                 AND last_ip_changed_at >= NOW() - INTERVAL '7 days') as "suspiciousNetwork"`,
    values
  );

  if (Number(res.rowCount ?? 0) === 0) {
    await p.query(
      `INSERT INTO user_device (
         user_id,
         device_id,
         first_seen_at,
         last_seen_at,
         first_ip_address,
         last_ip_address,
         user_agent,
         device_label
       )
       SELECT us.user_id,
              us.device_id,
              COALESCE(us.last_seen_at, NOW()),
              COALESCE(us.last_seen_at, NOW()),
              us.ip_address,
              us.ip_address,
              us.user_agent,
              us.device_label
       FROM user_session us
       WHERE us.user_id = $1
         AND us.device_id = $2
       ORDER BY us.last_seen_at DESC NULLS LAST, us.expires_at DESC
       LIMIT 1
       ON CONFLICT (user_id, device_id) DO NOTHING`,
      [userId, deviceId]
    );

    res = await p.query(
      `UPDATE user_device
       SET ${sets.join(", ")}
       WHERE user_id = $${userIdParamIndex} AND device_id = $${deviceIdParamIndex}
       RETURNING device_id as "deviceId",
                 nickname,
                 trusted_at as "trustedAt",
                 first_seen_at as "firstSeenAt",
                 last_seen_at as "lastSeenAt",
                 first_ip_address as "firstIpAddress",
                 last_ip_address as "lastIpAddress",
                 previous_ip_address as "previousIpAddress",
                 last_ip_changed_at as "lastIpChangedAt",
                 user_agent as "userAgent",
                 device_label as "deviceLabel",
                 (trusted_at IS NOT NULL
                   AND previous_ip_address IS NOT NULL
                   AND last_ip_address IS DISTINCT FROM previous_ip_address
                   AND last_ip_changed_at >= NOW() - INTERVAL '7 days') as "suspiciousNetwork"`,
      values
    );
  }

  return res.rows[0] ?? null;
}

export async function revokeSessionByJti(jti: string): Promise<void> {
  const p = getPool();
  await p.query(`UPDATE user_session SET revoked_at = NOW() WHERE jti = $1`, [jti]);
}

export async function revokeSessionByJtiForUser(userId: number, jti: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE user_session SET revoked_at = NOW() WHERE user_id = $1 AND jti = $2`,
    [userId, jti]
  );
  return Number(res.rowCount ?? 0) > 0;
}

export async function revokeOtherSessionsForUser(userId: number, currentJti: string): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `UPDATE user_session SET revoked_at = NOW() WHERE user_id = $1 AND jti <> $2`,
    [userId, currentJti]
  );
  return Number(res.rowCount ?? 0);
}

export async function revokeAllSessionsForUser(userId: number): Promise<void> {
  const p = getPool();
  await p.query(`UPDATE user_session SET revoked_at = NOW() WHERE user_id = $1`, [userId]);
}

export async function listAllUserSessions(limit = 500): Promise<AdminSessionSummary[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT us.user_id as "userId",
            u.username,
            u.display_name as "displayName",
            u.avatar_url as "avatarUrl",
            u.jellyfin_user_id as "jellyfinUserId",
            us.jti,
            us.expires_at as "expiresAt",
            us.revoked_at as "revokedAt",
            us.last_seen_at as "lastSeenAt",
            us.user_agent as "userAgent",
            us.device_label as "deviceLabel",
            us.ip_address as "ipAddress",
            us.device_id as "deviceId",
            ud.nickname as "deviceNickname",
            ud.trusted_at as "trustedAt",
            (ud.trusted_at IS NOT NULL
              AND ud.previous_ip_address IS NOT NULL
              AND ud.last_ip_address IS DISTINCT FROM ud.previous_ip_address
              AND ud.last_ip_changed_at >= NOW() - INTERVAL '7 days') as "suspiciousNetwork"
     FROM user_session us
     JOIN app_user u ON us.user_id = u.id
     LEFT JOIN user_device ud
       ON ud.user_id = us.user_id
      AND ud.device_id = us.device_id
     ORDER BY us.last_seen_at DESC NULLS LAST, us.expires_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

export async function deleteUserSessionByJtiForUser(userId: number, jti: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(`DELETE FROM user_session WHERE user_id = $1 AND jti = $2`, [userId, jti]);
  return Number(res.rowCount ?? 0) > 0;
}

export async function deleteUserSessionByJti(jti: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(`DELETE FROM user_session WHERE jti = $1`, [jti]);
  return Number(res.rowCount ?? 0) > 0;
}

export async function purgeExpiredSessions(): Promise<number> {
  const p = getPool();
  const res = await p.query(`DELETE FROM user_session WHERE revoked_at IS NOT NULL OR expires_at <= NOW()`);
  return Number(res.rowCount ?? 0);
}
