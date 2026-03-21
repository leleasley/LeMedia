import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getSecurityAlertsConfig } from "@/lib/security-alerts-config";
import { notifySecurityAlertEvent } from "@/notifications/security-events";
import { requireCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const config = await getSecurityAlertsConfig();
  if (config.endpointIds.length === 0) {
    return NextResponse.json(
      { error: "No security alert endpoints configured. Add at least one endpoint first." },
      { status: 400 }
    );
  }

  const result = await notifySecurityAlertEvent("security_login_failure", {
    title: "Test Security Alert",
    username: user.username,
    ip: "127.0.0.1 (test)",
    details: "This is a test security alert from the LeMedia admin panel.",
  });

  return NextResponse.json(result);
}
