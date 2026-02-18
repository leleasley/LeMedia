import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { createUserApiToken, getUserApiToken, getUserWithHash, revokeUserApiToken } from "@/db";
import { generateUserApiToken } from "@/lib/api-tokens";
import { requireCsrf } from "@/lib/csrf";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/auth-utils";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const tokenInfo = await getUserApiToken(user.id);
  return cacheableJsonResponseWithETag(req, {
    token: tokenInfo?.token ?? null,
    createdAt: tokenInfo?.createdAt ?? null,
    updatedAt: tokenInfo?.updatedAt ?? null
  }, { maxAge: 0, sMaxAge: 0, private: true });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!password) return NextResponse.json({ error: "Password is required" }, { status: 400 });
  if (!dbUser.password_hash || !(await verifyPassword(password, dbUser.password_hash))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const token = generateUserApiToken();
  const saved = await createUserApiToken(user.id, "Default", token);

  await logAuditEvent({
    action: "user.updated",
    actor: user.username,
    metadata: { operation: "api_token_rotated" },
    ip: getClientIp(req)
  });

  return NextResponse.json({ token: saved.token, createdAt: saved.createdAt, updatedAt: saved.updatedAt });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  const body = await req.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!password) return NextResponse.json({ error: "Password is required" }, { status: 400 });
  if (!dbUser.password_hash || !(await verifyPassword(password, dbUser.password_hash))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }

  const revoked = await revokeUserApiToken(user.id);

  await logAuditEvent({
    action: "user.updated",
    actor: user.username,
    metadata: { operation: "api_token_revoked", revoked },
    ip: getClientIp(req)
  });

  return NextResponse.json({ revoked });
}
