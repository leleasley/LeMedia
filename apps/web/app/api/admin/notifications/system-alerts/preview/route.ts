import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { listSystemAlertEndpointsForDelivery, type SystemAlertEvent, type SystemAlertDelivery } from "@/notifications/system-events";

const PreviewSchema = z.object({
  routingMode: z.enum(["global_only", "target_users", "target_users_and_global", "all_user_endpoints_non_email"]),
  targetUserIds: z.array(z.coerce.number().int().positive()).default([])
});

const EVENTS: SystemAlertEvent[] = [
  "system_alert_high_latency",
  "system_alert_service_unreachable",
  "system_alert_indexers_unavailable"
];

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(request);
  if (csrf) return csrf;

  const body = await request.json().catch(() => ({}));
  const parsed = PreviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const targetUserIds = Array.from(new Set(parsed.data.targetUserIds)).filter((id) => Number.isFinite(id) && id > 0);
  const delivery: SystemAlertDelivery = {
    routingMode: parsed.data.routingMode,
    userIds: targetUserIds,
    includeGlobalEndpoints:
      parsed.data.routingMode === "global_only" || parsed.data.routingMode === "target_users_and_global"
  };

  const perEventEntries = await Promise.all(
    EVENTS.map(async (event) => {
      const endpoints = await listSystemAlertEndpointsForDelivery(event, delivery);
      return [event, endpoints] as const;
    })
  );

  const perEvent = Object.fromEntries(
    perEventEntries.map(([event, endpoints]) => [
      event,
      {
        count: endpoints.length,
        endpoints
      }
    ])
  );

  const unionMap = new Map<number, { id: number; name: string; type: string; isGlobal: boolean; events: SystemAlertEvent[] }>();
  for (const [event, endpoints] of perEventEntries) {
    for (const endpoint of endpoints) {
      const existing = unionMap.get(endpoint.id);
      if (existing) {
        if (!existing.events.includes(event)) existing.events.push(event);
      } else {
        unionMap.set(endpoint.id, { ...endpoint, events: [event] });
      }
    }
  }

  const union = Array.from(unionMap.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.name.localeCompare(b.name);
  });

  const byType = union.reduce<Record<string, number>>((acc, endpoint) => {
    acc[endpoint.type] = (acc[endpoint.type] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    routingMode: parsed.data.routingMode,
    targetUserIds,
    unionCount: union.length,
    byType,
    union,
    perEvent
  });
}
