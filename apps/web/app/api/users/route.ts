import { hashPassword, verifyPassword } from "@/lib/auth-utils";
import { requireAdmin } from "@/auth";
import { addUserPasswordHistory, getUserById, getUserPasswordHistory, getUserWithHash, listNotificationEndpoints, listUsers, setUserPassword, setUserNotificationEndpointIds } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { normalizeGroupList } from "@/lib/groups";
import { getPasswordPolicyResult } from "@/lib/password-policy";

const createSchema = z.object({
  username: z.string().trim().min(1).transform(u => u.toLowerCase()),
  password: z.string().min(8),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  groups: z.array(z.string()).optional(),
  notificationEndpointIds: z.array(z.coerce.number().int().positive()).optional()
});

function normalizeEmail(raw?: string) {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function validationError(error: unknown) {
  if (error instanceof z.ZodError) {
    console.warn("[API] Invalid user payload", { issues: error.issues });
  } else {
    console.warn("[API] Invalid user payload", { error });
  }
  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const users = await listUsers();
  return jsonResponseWithETag(req, { users });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let payload;
  try {
    payload = createSchema.parse(await req.json());
  } catch (error) {
    return validationError(error);
  }

  const groups = normalizeGroupList(payload.groups);
  const email = normalizeEmail(payload.email);
  const policy = getPasswordPolicyResult({ password: payload.password, username: payload.username });
  if (policy.errors.length) {
    return NextResponse.json({ error: policy.errors[0] }, { status: 400 });
  }

  const existing = await getUserWithHash(payload.username);
  if (existing?.password_hash) {
    const history = await getUserPasswordHistory(existing.id);
    const hashes = [existing.password_hash, ...history].filter((hash): hash is string => typeof hash === "string" && hash.length > 0);
    const checks = await Promise.all(hashes.map(hash => verifyPassword(payload.password, hash)));
    const reused = checks.some(Boolean);
    if (reused) {
      return NextResponse.json({ error: "Password cannot be reused" }, { status: 400 });
    }
  }

  const passwordHash = await hashPassword(payload.password);

  const created = await setUserPassword(payload.username, groups, passwordHash, email);
  await addUserPasswordHistory(created.id, passwordHash);
  if (payload.notificationEndpointIds !== undefined) {
    const endpoints = await listNotificationEndpoints();
    const available = new Set(endpoints.map(endpoint => endpoint.id));
    const filtered = payload.notificationEndpointIds
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && available.has(id));
    await setUserNotificationEndpointIds(created.id, filtered);
  }
  const full = await getUserById(created.id);
  if (!full) {
    return NextResponse.json({ error: "Failed to load created user" }, { status: 500 });
  }

  // Log user creation
  await logAuditEvent({
    action: "user.created",
    actor: user.username,
    target: full.username,
    metadata: { email: full.email, groups: full.groups },
    ip: getClientIp(req),
  });

  return NextResponse.json({ user: full });
}
