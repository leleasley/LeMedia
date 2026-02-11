import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { listMediaServices } from "@/lib/service-config";
import { checkDatabaseHealth } from "@/db";
import { jsonResponseWithETag } from "@/lib/api-optimization";

type ServiceHealth = {
  name: string;
  type: string;
  ok: boolean;
};

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const [dbOk, services] = await Promise.all([
    checkDatabaseHealth().catch(() => false),
    listMediaServices().catch(() => []),
  ]);

  const enabledServices = services.filter((s) => s.enabled);

  const results: ServiceHealth[] = [
    { name: "Database", type: "database", ok: dbOk },
  ];

  for (const svc of enabledServices) {
    const baseUrl = svc.base_url.replace(/\/+$/, "");
    let ok = false;
    try {
      if (["radarr", "sonarr"].includes(svc.type)) {
        const res = await fetch(`${baseUrl}/ping`, { signal: AbortSignal.timeout(3000) });
        ok = res.ok || res.status === 200;
      } else if (svc.type === "prowlarr") {
        const res = await fetch(`${baseUrl}/ping`, { signal: AbortSignal.timeout(3000) });
        ok = res.ok || res.status === 200;
      } else {
        // For other services just try to reach the base URL
        const res = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) });
        ok = res.ok || res.status < 500;
      }
    } catch {
      ok = false;
    }
    results.push({ name: svc.name, type: svc.type, ok });
  }

  return jsonResponseWithETag(req, { services: results });
}
