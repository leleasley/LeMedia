import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getMaintenanceState, setMaintenanceState } from "@/lib/maintenance";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

const payloadSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(500).nullable().optional()
});

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const state = await getMaintenanceState();
  return NextResponse.json({ state });
}

export async function PUT(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let parsed;
  try {
    parsed = payloadSchema.parse(await req.json());
  } catch (error: any) {
    return NextResponse.json({ error: "Invalid payload", details: error?.issues ?? [] }, { status: 400 });
  }

  const state = await setMaintenanceState({ enabled: parsed.enabled, message: parsed.message ?? undefined });

  await logAuditEvent({
    action: "admin.maintenance_toggled",
    actor: user.username,
    metadata: state,
    ip: getClientIp(req)
  });

  return NextResponse.json({ ok: true, state });
}
