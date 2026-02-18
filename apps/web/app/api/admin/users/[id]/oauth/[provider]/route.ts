import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash, unlinkUserOAuthAccount } from "@/db";
import { getPool } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { verifyMfaCode } from "@/lib/mfa-reauth";
import { isOAuthProvider, type OAuthProvider } from "@/lib/oauth-providers";

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string; provider: string }> }
) {
  const appUser = await requireUser();
  if (appUser instanceof NextResponse) return appUser;
  if (!appUser.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id, provider: rawProvider } = await context.params;
  if (!isOAuthProvider(rawProvider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider" }, { status: 404 });
  }
  const provider: OAuthProvider = rawProvider;

  const body = await req.json().catch(() => ({}));
  const mfaCode = typeof body?.mfaCode === "string" ? body.mfaCode : "";

  const adminDbUser = await getUserWithHash(appUser.username);
  if (!adminDbUser) {
    return NextResponse.json({ error: "Admin user not found" }, { status: 404 });
  }

  const mfaCheck = verifyMfaCode(adminDbUser.mfa_secret, mfaCode);
  if (!mfaCheck.ok) {
    return NextResponse.json({ error: mfaCheck.message }, { status: 400 });
  }

  const userId = Number.parseInt(id, 10);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  await unlinkUserOAuthAccount(userId, provider);

  const db = getPool();
  const targetRes = await db.query("SELECT username FROM app_user WHERE id = $1", [userId]);
  const targetUsername = targetRes.rows[0]?.username as string | undefined;

  await logAuditEvent({
    action: "user.updated",
    actor: appUser.username,
    target: targetUsername ?? String(userId),
    metadata: { oauthProvider: provider, oauthAction: "admin_unlinked" },
    ip: getClientIp(req)
  });

  return NextResponse.json({ success: true });
}
