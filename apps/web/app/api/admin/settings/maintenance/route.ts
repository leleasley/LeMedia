import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getMaintenanceState, setMaintenanceState } from "@/lib/maintenance";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { notifyMaintenanceModeEnabled } from "@/notifications/system-events";

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
    if (error?.issues) {
      logger.warn("[API] Invalid maintenance payload", { issues: error.issues });
    } else {
      logger.warn("[API] Invalid maintenance payload", { error });
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const previousState = await getMaintenanceState();
  const state = await setMaintenanceState({ enabled: parsed.enabled, message: parsed.message ?? undefined });

  if (state.enabled && !previousState.enabled) {
    try {
      await notifyMaintenanceModeEnabled(state.message ?? undefined);
    } catch (error) {
      logger.warn("[API] Failed to send maintenance mode notification", {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await logAuditEvent({
    action: "admin.maintenance_toggled",
    actor: user.username,
    metadata: state,
    ip: getClientIp(req)
  });

  return NextResponse.json({ ok: true, state });
}
