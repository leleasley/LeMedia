import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { listUserSessions, revokeSessionByJtiForUser } from "@/db";
import { verifySessionToken } from "@/lib/session";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const RevokeSchema = z.object({
  jti: z.string().trim().min(1)
});

function getCurrentJti(req: NextRequest): Promise<string | null> {
  const raw = req.cookies.get("lemedia_session")?.value ?? "";
  if (!raw) return Promise.resolve(null);
  return verifySessionToken(raw).then(session => session?.jti ?? null);
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const [sessions, currentJti] = await Promise.all([
    listUserSessions(user.id),
    getCurrentJti(req)
  ]);

  return NextResponse.json({
    currentJti,
    sessions: sessions.map(session => ({
      jti: session.jti,
      expiresAt: session.expiresAt,
      revokedAt: session.revokedAt,
      lastSeenAt: session.lastSeenAt
    }))
  });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: z.infer<typeof RevokeSchema>;
  try {
    body = RevokeSchema.parse(await req.json());
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues.map(e => e.message).join(", ") : "Invalid request body";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const currentJti = await getCurrentJti(req);
  if (currentJti && body.jti === currentJti) {
    return NextResponse.json({ error: "Use logout to revoke the current session" }, { status: 400 });
  }

  const revoked = await revokeSessionByJtiForUser(user.id, body.jti);
  if (!revoked) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await logAuditEvent({
    action: "user.sessions_revoked",
    actor: user.username,
    metadata: { reason: "self_revoke_single" },
    ip: getClientIp(req),
  });

  return NextResponse.json({ success: true });
}
