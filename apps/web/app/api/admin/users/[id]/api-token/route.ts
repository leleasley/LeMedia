import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { createUserApiToken, getUserApiToken, revokeUserApiToken } from "@/db";
import { generateUserApiToken } from "@/lib/api-tokens";
import { requireCsrf } from "@/lib/csrf";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

function parseUserId(raw: string) {
  const id = Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireUser();
  if (currentUser instanceof NextResponse) return currentUser;
  if (!currentUser.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const userId = parseUserId(id);
  if (!userId) return NextResponse.json({ error: "Invalid user" }, { status: 400 });

  const tokenInfo = await getUserApiToken(userId);
  return cacheableJsonResponseWithETag(req, {
    token: tokenInfo?.token ?? null,
    createdAt: tokenInfo?.createdAt ?? null,
    updatedAt: tokenInfo?.updatedAt ?? null
  }, { maxAge: 0, sMaxAge: 0, private: true });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireUser();
  if (currentUser instanceof NextResponse) return currentUser;
  if (!currentUser.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = await params;
  const userId = parseUserId(id);
  if (!userId) return NextResponse.json({ error: "Invalid user" }, { status: 400 });

  const token = generateUserApiToken();
  const saved = await createUserApiToken(userId, "Admin", token);

  await logAuditEvent({
    action: "user.updated",
    actor: currentUser.username,
    target: String(userId),
    metadata: { operation: "admin_api_token_rotated" },
    ip: getClientIp(req)
  });

  return NextResponse.json({ token: saved.token, createdAt: saved.createdAt, updatedAt: saved.updatedAt });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await requireUser();
  if (currentUser instanceof NextResponse) return currentUser;
  if (!currentUser.isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = await params;
  const userId = parseUserId(id);
  if (!userId) return NextResponse.json({ error: "Invalid user" }, { status: 400 });

  const revoked = await revokeUserApiToken(userId);

  await logAuditEvent({
    action: "user.updated",
    actor: currentUser.username,
    target: String(userId),
    metadata: { operation: "admin_api_token_revoked", revoked },
    ip: getClientIp(req)
  });

  return NextResponse.json({ revoked });
}
