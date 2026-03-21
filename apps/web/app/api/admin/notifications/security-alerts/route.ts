import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getSecurityAlertsConfig, setSecurityAlertsConfig } from "@/lib/security-alerts-config";
import { listGlobalNotificationEndpointsFull } from "@/db";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  loginFailureEnabled: z.boolean().optional(),
  newUserEnabled: z.boolean().optional(),
  mfaFailureEnabled: z.boolean().optional(),
  endpointIds: z.array(z.number().int().positive()).optional(),
  cooldownMs: z.number().int().min(1000).max(86_400_000).optional(),
});

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const [config, globalEndpoints] = await Promise.all([
    getSecurityAlertsConfig(),
    listGlobalNotificationEndpointsFull(),
  ]);

  const endpoints = globalEndpoints
    .filter((ep) => ep.enabled)
    .map((ep) => ({
      id: ep.id,
      name: ep.name,
      type: ep.type,
      enabled: ep.enabled,
    }));

  return NextResponse.json({ config, endpoints });
}

export async function PUT(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const current = await getSecurityAlertsConfig();
  const updated = await setSecurityAlertsConfig({ ...current, ...parsed.data });
  return NextResponse.json({ config: updated });
}
