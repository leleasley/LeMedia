import { hashPassword } from "@/lib/auth-utils";
import { requireAdmin } from "@/auth";
import {
  deleteUserById,
  getUserById,
  getSettingInt,
  listNotificationEndpoints,
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

const updateSchema = z.object({
  username: z.string().trim().min(1).optional(),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  groups: z.array(z.string()).optional(),
  password: z.string().min(6).optional(),
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
  const message = error instanceof z.ZodError ? error.issues.map(err => err.message).join(", ") : "Invalid request body";
  return NextResponse.json({ error: message }, { status: 400 });
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

  const profile = await updateUserProfile(id, {
    username: payload.username?.toLowerCase(),
    email: payload.email === "" ? null : payload.email,
    groups: payload.groups?.map(g => g.trim()).filter(Boolean)
  });

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const changes: string[] = [];
  
  if (payload.password) {
    await updateUserPasswordById(id, hashPassword(payload.password));
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
    const groups = fresh.groups.length ? fresh.groups : ["users"];
    const jti = randomUUID();
    const sessionToken = await createSessionToken({ username: fresh.username, groups, maxAgeSeconds: sessionMaxAge, jti });
    await createUserSession(fresh.id, jti, new Date(Date.now() + sessionMaxAge * 1000));
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
