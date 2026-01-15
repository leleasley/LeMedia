import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getUserById, revokeAllSessionsForUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: { id: string } | Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const resolved = await Promise.resolve(params);
  const userId = Number(resolved.id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await revokeAllSessionsForUser(userId);
  await logAuditEvent({
    action: "user.sessions_revoked",
    actor: admin.username,
    target: user.username,
    metadata: { reason: "admin_logout_all" },
    ip: getClientIp(req),
  });

  return NextResponse.json({ success: true });
}
