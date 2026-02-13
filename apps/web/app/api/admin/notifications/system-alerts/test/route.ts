import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { notifySystemAlertEventWithDelivery } from "@/notifications/system-events";
import { getSystemAlertsConfig } from "@/lib/system-alerts-config";

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const config = await getSystemAlertsConfig();
  const result = await notifySystemAlertEventWithDelivery("system_alert_service_unreachable", {
    title: "System Alerts test notification",
    serviceName: "LeMedia",
    serviceType: "system",
    details: `Triggered manually by ${user.username}.`
  }, {
    includeGlobalEndpoints: config.includeGlobalEndpoints,
    userIds: config.targetUserIds,
    ignoreEventFilters: true
  });

  if (result.eligible <= 0) {
    return NextResponse.json(
      {
        error: "No target endpoints found. Select users with assigned notification channels or enable global endpoints."
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, eligible: result.eligible, delivered: result.delivered });
}
