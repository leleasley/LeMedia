import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { revokeOtherSessionsForUser } from "@/db";
import { verifySessionToken } from "@/lib/session";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

async function getCurrentJti(req: NextRequest): Promise<string | null> {
  const raw = req.cookies.get("lemedia_session")?.value ?? "";
  if (!raw) return null;
  const session = await verifySessionToken(raw);
  return session?.jti ?? null;
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const currentJti = await getCurrentJti(req);
  if (!currentJti) {
    return NextResponse.json({ error: "Session not found" }, { status: 400 });
  }

  const revokedCount = await revokeOtherSessionsForUser(user.id, currentJti);
  await logAuditEvent({
    action: "user.sessions_revoked",
    actor: user.username,
    metadata: { reason: "self_revoke_others", count: revokedCount },
    ip: getClientIp(req),
  });

  return NextResponse.json({ success: true, revokedCount });
}
