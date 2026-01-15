import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { generateExternalApiKey, getExternalApiKey, setExternalApiKey } from "@/lib/external-api";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const apiKey = await getExternalApiKey();
  return jsonResponseWithETag(req, { apiKey });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const apiKey = generateExternalApiKey();
  await setExternalApiKey(apiKey);

  await logAuditEvent({
    action: "admin.settings_changed",
    actor: user.username,
    metadata: { section: "api_key", operation: "rotated" },
    ip: getClientIp(req)
  });

  return NextResponse.json({ apiKey });
}
