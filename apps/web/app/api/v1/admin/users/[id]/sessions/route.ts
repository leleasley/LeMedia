import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getUserById, listUserSessions, revokeSessionByJtiForUser, deleteUserSessionByJtiForUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { z } from "zod";
import { logger } from "@/lib/logger";

const RevokeSchema = z.object({
  jti: z.string().trim().min(1)
});

export async function GET(_: NextRequest, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;

  const resolved = await Promise.resolve(params);
  const userId = Number(resolved.id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const sessions = await listUserSessions(userId);
  return NextResponse.json({
    userId,
    sessions: sessions.map(session => ({
      jti: session.jti,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      lastSeenAt: session.lastSeenAt,
      userAgent: session.userAgent,
      deviceLabel: session.deviceLabel,
      ipAddress: session.ipAddress
    }))
  });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: z.infer<typeof RevokeSchema>;
  try {
    body = RevokeSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("[API] Invalid admin sessions payload", { issues: error.issues });
    } else {
      logger.warn("[API] Invalid admin sessions payload", { error });
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const resolved = await Promise.resolve(params);
  const userId = Number(resolved.id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const revoked = await revokeSessionByJtiForUser(userId, body.jti);
  if (!revoked) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await logAuditEvent({
    action: "user.sessions_revoked",
    actor: admin.username,
    target: user.username,
    metadata: { reason: "admin_revoke_single" },
    ip: getClientIp(req),
  });

  return NextResponse.json({ success: true });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: z.infer<typeof RevokeSchema>;
  try {
    body = RevokeSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("[API] Invalid admin sessions payload", { issues: error.issues });
    } else {
      logger.warn("[API] Invalid admin sessions payload", { error });
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const resolved = await Promise.resolve(params);
  const userId = Number(resolved.id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const sessions = await listUserSessions(userId);
  const target = sessions.find(session => session.jti === body.jti);
  if (!target) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (!target.revokedAt) {
    return NextResponse.json({ error: "Only revoked sessions can be deleted" }, { status: 400 });
  }

  const deleted = await deleteUserSessionByJtiForUser(userId, body.jti);
  if (!deleted) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await logAuditEvent({
    action: "user.sessions_revoked",
    actor: admin.username,
    target: user.username,
    metadata: { reason: "admin_delete_revoked" },
    ip: getClientIp(req),
  });

  return NextResponse.json({ success: true });
}
