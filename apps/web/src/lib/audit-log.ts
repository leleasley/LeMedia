import "server-only";
import { getPool } from "@/db";

export type AuditAction =
  | "user.created"
  | "user.deleted"
  | "user.password_changed"
  | "user.mfa_reset"
  | "user.groups_changed"
  | "user.permissions_changed"
  | "user.jellyfin_unlinked"
  | "user.sessions_revoked"
  | "user.updated"
  | "user.login"
  | "admin.settings_changed"
  | "admin.maintenance_toggled"
  | "admin.jellyfin_configured"
  | "admin.jellyfin_reconfigured"
  | "admin.jellyfin_auth_failed"
  | "api_key.rotated"
  | "notification_endpoint.created"
  | "notification_endpoint.updated"
  | "notification_endpoint.deleted"
  | "media_share.created"
  | "media_share.deleted"
  | "calendar.feed_rotated";

export interface AuditLogEntry {
  action: AuditAction;
  actor: string;
  target?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

export async function logAuditEvent(entry: AuditLogEntry) {
  const p = getPool();
  await p.query(
    `INSERT INTO audit_log (action, actor, target, metadata, ip, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [
      entry.action,
      entry.actor,
      entry.target ?? null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
      entry.ip ?? null,
    ]
  );
}
