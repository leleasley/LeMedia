import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { createUserApiToken, getUserWithHash, listUserApiTokens, revokeUserApiTokenById } from "@/db";
import { generateUserApiToken } from "@/lib/api-tokens";
import { requireCsrf } from "@/lib/csrf";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { verifyPassword } from "@/lib/auth-utils";

function parseName(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (value.length > 50) return null;
  return value;
}

function parseId(raw: unknown) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const tokens = await listUserApiTokens(user.id);
  return cacheableJsonResponseWithETag(req, { tokens }, { maxAge: 0, sMaxAge: 0, private: true });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let payload: { name?: string; password?: string } = {};
  try {
    payload = await req.json();
  } catch {
    // ignore
  }
  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!password) return NextResponse.json({ error: "Password is required" }, { status: 400 });
  if (!dbUser.password_hash || !(await verifyPassword(password, dbUser.password_hash))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }
  const name = parseName(payload?.name) ?? "Default";
  const token = generateUserApiToken();
  const created = await createUserApiToken(user.id, name, token);

  await logAuditEvent({
    action: "user.updated",
    actor: user.username,
    metadata: { operation: "api_token_created", tokenId: created.id, name },
    ip: getClientIp(req)
  });

  return NextResponse.json({
    token: created.token,
    tokenInfo: {
      id: created.id,
      name: created.name,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt
    }
  });
}

export async function DELETE(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let payload: { id?: number; password?: string } = {};
  try {
    payload = await req.json();
  } catch {
    // ignore
  }
  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const password = typeof payload.password === "string" ? payload.password : "";
  if (!password) return NextResponse.json({ error: "Password is required" }, { status: 400 });
  if (!dbUser.password_hash || !(await verifyPassword(password, dbUser.password_hash))) {
    return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  }
  const id = parseId(payload?.id);
  if (!id) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const revoked = await revokeUserApiTokenById(user.id, id);

  await logAuditEvent({
    action: "user.updated",
    actor: user.username,
    metadata: { operation: "api_token_revoked", tokenId: id, revoked },
    ip: getClientIp(req)
  });

  return NextResponse.json({ revoked });
}
