import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserApiToken, revokeUserApiToken, upsertUserApiToken } from "@/db";
import { generateUserApiToken } from "@/lib/api-tokens";
import { requireCsrf } from "@/lib/csrf";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

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

  const token = generateUserApiToken();
  const saved = await upsertUserApiToken(user.id, token);

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

  const revoked = await revokeUserApiToken(user.id);

  await logAuditEvent({
    action: "user.updated",
    actor: user.username,
    metadata: { operation: "api_token_revoked", revoked },
    ip: getClientIp(req)
  });

  return NextResponse.json({ revoked });
}
