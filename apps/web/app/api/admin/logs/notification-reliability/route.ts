import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getNotificationReliabilityOverview, listAdminUserOptions, listNotificationEndpointsForUser } from "@/db";
import { notifySystemAlertEventWithDelivery } from "@/notifications/system-events";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const [overview, users] = await Promise.all([
    getNotificationReliabilityOverview(14),
    listAdminUserOptions()
  ]);

  const response = NextResponse.json({
    overview,
    users
  });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  let body: { userId?: number } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const userId = Number(body.userId);
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "Valid userId is required" }, { status: 400 });
  }

  const userEndpoints = await listNotificationEndpointsForUser(userId);
  if (userEndpoints.length === 0) {
    return NextResponse.json({ error: "User has no assigned notification endpoints" }, { status: 400 });
  }

  const result = await notifySystemAlertEventWithDelivery(
    "system_alert_service_unreachable",
    {
      title: "Notification reliability test",
      serviceName: "LeMedia",
      serviceType: "internal",
      details: `Manual test triggered by ${user.username} for user #${userId}.`
    },
    {
      includeGlobalEndpoints: false,
      userIds: [userId],
      ignoreEventFilters: true
    }
  );

  await logAuditEvent({
    action: "notification_reliability.test_user",
    actor: user.username,
    target: String(userId),
    metadata: {
      eligible: result.eligible,
      delivered: result.delivered
    },
    ip: getClientIp(request),
  });

  return NextResponse.json({
    ok: true,
    eligible: result.eligible,
    delivered: result.delivered
  });
}
