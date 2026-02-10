import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getUserById, resetUserMfaById } from "@/db";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

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
    console.warn("[API] Invalid reset MFA request", { issues: error.issues });
  } else {
    console.warn("[API] Invalid reset MFA request", { error });
  }
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}

export async function POST(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsedParams = await resolveParams(params);
  const parsed = idSchema.safeParse(parsedParams);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const targetUser = await getUserById(parsed.data.id);
  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await resetUserMfaById(parsed.data.id);
  
  // Log MFA reset
  await logAuditEvent({
    action: "user.mfa_reset",
    actor: user.username,
    target: targetUser.username,
    ip: getClientIp(req),
  });
  
  return NextResponse.json({ ok: true });
}
