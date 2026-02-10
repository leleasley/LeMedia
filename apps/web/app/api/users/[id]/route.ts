import { hashPassword, verifyPassword } from "@/lib/auth-utils";
import { requireAdmin } from "@/auth";
import {
  deleteUserById,
  getUserById,
  getUserPasswordHistory,
  getUserWithHashById,
  getSettingInt,
  listNotificationEndpoints,
  addUserPasswordHistory,
  setUserNotificationEndpointIds,
  updateUserPasswordById,
  updateUserProfile,
  createUserSession
} from "@/db";
import { createSessionToken } from "@/lib/session";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { randomUUID } from "crypto";
import { summarizeUserAgent } from "@/lib/device-info";
import { normalizeGroupList } from "@/lib/groups";
import { getPasswordPolicyResult } from "@/lib/password-policy";
import { logger } from "@/lib/logger";

const updateSchema = z.object({
  username: z.string().trim().min(1).optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  groups: z.array(z.string()).optional(),
  password: z.string().min(1).optional(),
  notificationEndpointIds: z.array(z.coerce.number().int().positive()).optional()
});

const idSchema = z.object({ id: z.coerce.number().int().positive() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function validationError(error: unknown) {
  if (error instanceof z.ZodError) {
    logger.warn("[API] Invalid user update payload", { issues: error.issues });
  } else {
    logger.warn("[API] Invalid user update payload", { error });
  }
  return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
}

export async function PUT(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let payload;
  let id;
  try {
    payload = updateSchema.parse(await req.json());
    id = idSchema.parse(await resolveParams(params)).id;
  } catch (error) {
    return validationError(error);
  }

  const target = await getUserWithHashById(id);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (payload.password) {
    const nextUsername = payload.username?.toLowerCase() ?? target.username;
    const newPassword = payload.password ?? "";
    const policy = getPasswordPolicyResult({ password: newPassword, username: nextUsername });
    if (policy.errors.length) {
      return NextResponse.json({ error: policy.errors[0] }, { status: 400 });
    }
    const history = await getUserPasswordHistory(target.id);
    const hashes = [target.password_hash, ...history].filter((hash): hash is string => typeof hash === "string" && hash.length > 0);
    const checks = await Promise.all(hashes.map(hash => verifyPassword(newPassword, hash)));
    const reused = checks.some(Boolean);
    if (reused) {
      return NextResponse.json({ error: "Password cannot be reused" }, { status: 400 });
    }
  }

  const profile = await updateUserProfile(id, {
    username: payload.username?.toLowerCase(),
    email: payload.email === "" ? null : payload.email,
    groups: payload.groups ? normalizeGroupList(payload.groups) : undefined
  });

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const changes: string[] = [];
  
  if (payload.password) {
    const passwordHash = await hashPassword(payload.password);
    await updateUserPasswordById(id, passwordHash);
    await addUserPasswordHistory(id, passwordHash);
    changes.push("password");
    await logAuditEvent({
      action: "user.password_changed",
      actor: user.username,
      target: profile.username,
      ip: getClientIp(req),
    });
  }

  if (payload.username || payload.email || payload.groups) {
    changes.push("profile");
  }

  if (payload.notificationEndpointIds !== undefined) {
    const endpoints = await listNotificationEndpoints();
    const available = new Set(endpoints.map(endpoint => endpoint.id));
    const filtered = payload.notificationEndpointIds
      .map(id => Number(id))
      .filter(id => Number.isFinite(id) && available.has(id));
    await setUserNotificationEndpointIds(id, filtered);
  }

  const fresh = await getUserById(id);
  
  // Log profile update if any changes were made
  if (changes.length > 0 && fresh) {
    await logAuditEvent({
      action: "user.updated",
      actor: user.username,
      target: fresh.username,
      metadata: { changes },
      ip: getClientIp(req),
    });
  }
  
  const response = NextResponse.json({ user: fresh ?? profile });

  if (fresh && fresh.username === user.username) {
    const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
    const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
    const ctx = getRequestContext(req);
    const cookieBase = getCookieBase(ctx, true);
    const groups = normalizeGroupList(fresh.groups);
    const jti = randomUUID();
    const sessionToken = await createSessionToken({ username: fresh.username, groups, maxAgeSeconds: sessionMaxAge, jti });
    const userAgent = req.headers.get("user-agent");
    const deviceLabel = summarizeUserAgent(userAgent);
    await createUserSession(fresh.id, jti, new Date(Date.now() + sessionMaxAge * 1000), {
      userAgent,
      deviceLabel,
      ipAddress: getClientIp(req)
    });
    response.cookies.set("lemedia_session", sessionToken, { ...cookieBase, maxAge: sessionMaxAge });
    response.cookies.set("lemedia_session_reset", "", { ...cookieBase, httpOnly: false, maxAge: 0 });
  }

  return response;
}

export async function DELETE(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  if (!user.isAdmin) return forbidden();
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsed = idSchema.safeParse(await resolveParams(params));
  if (!parsed.success) return validationError(parsed.error);
  const id = parsed.data.id;

  const existing = await getUserById(id);
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await deleteUserById(id);
  
  // Log user deletion
  await logAuditEvent({
    action: "user.deleted",
    actor: user.username,
    target: existing.username,
    metadata: { userId: id },
    ip: getClientIp(req),
  });
  
  return NextResponse.json({ ok: true });
}
