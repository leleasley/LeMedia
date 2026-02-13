import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getSystemAlertsConfig, setSystemAlertsConfig } from "@/lib/system-alerts-config";
import { listUsers } from "@/db";
import { isAdminGroup } from "@/lib/groups";

const UpdateSchema = z.object({
  enabled: z.boolean(),
  highLatencyEnabled: z.boolean(),
  serviceUnreachableEnabled: z.boolean(),
  indexersUnavailableEnabled: z.boolean(),
  includeGlobalEndpoints: z.boolean(),
  targetUserIds: z.array(z.coerce.number().int().positive()).default([]),
  latencyThresholdMs: z.coerce.number().int().min(1000).max(600000),
  requestTimeoutMs: z.coerce.number().int().min(1000).max(600000),
  cooldownMs: z.coerce.number().int().min(1000).max(86400000)
});

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const [config, users] = await Promise.all([getSystemAlertsConfig(), listUsers()]);
  return NextResponse.json({
    config,
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName ?? null,
      isAdmin: isAdminGroup((u.groups ?? []).join(",")),
      banned: !!u.banned,
      notificationEndpointIds: u.notificationEndpointIds ?? []
    }))
  });
}

export async function PUT(request: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const body = await request.json().catch(() => ({}));
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.requestTimeoutMs < parsed.data.latencyThresholdMs) {
    return NextResponse.json(
      { error: "Request timeout must be greater than or equal to latency threshold" },
      { status: 400 }
    );
  }
  if (!parsed.data.includeGlobalEndpoints && parsed.data.targetUserIds.length === 0) {
    return NextResponse.json(
      { error: "Select at least one target user or enable global endpoints" },
      { status: 400 }
    );
  }

  const saved = await setSystemAlertsConfig({
    ...parsed.data,
    targetUserIds: Array.from(new Set(parsed.data.targetUserIds)).filter((id) => Number.isFinite(id) && id > 0)
  });
  return NextResponse.json(saved);
}
