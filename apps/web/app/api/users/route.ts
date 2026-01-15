import { hashPassword } from "@/lib/auth-utils";
import { requireAdmin } from "@/auth";
import { getUserById, listNotificationEndpoints, listUsers, setUserPassword, setUserNotificationEndpointIds } from "@/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

const DEFAULT_GROUPS = ["users"];

const createSchema = z.object({
  username: z.string().trim().min(1).transform(u => u.toLowerCase()),
  password: z.string().min(6),
  email: z.union([z.string().trim().email(), z.literal("")]).optional(),
  groups: z.array(z.string()).optional(),
  notificationEndpointIds: z.array(z.coerce.number().int().positive()).optional()
});

function normalizeGroups(groups?: string[]) {
  if (!groups?.length) return DEFAULT_GROUPS;
  const cleaned = groups.map(g => g.trim()).filter(Boolean);
  return cleaned.length ? cleaned : DEFAULT_GROUPS;
}

function normalizeEmail(raw?: string) {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function validationError(error: unknown) {
  const message = error instanceof z.ZodError ? error.issues.map(err => err.message).join(", ") : "Invalid request body";
  return NextResponse.json({ error: message }, { status: 400 });
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

  const groups = normalizeGroups(payload.groups);
  const email = normalizeEmail(payload.email);
  const passwordHash = hashPassword(payload.password);

  const created = await setUserPassword(payload.username, groups, passwordHash, email);
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
