import { NextRequest, NextResponse } from "next/server";
import { listMediaServices } from "@/lib/service-config";
import { buildSonarrServerSummary } from "@/lib/service-utils";
import { withCache } from "@/lib/local-cache";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  const servers = await withCache("service:sonarr:list", 60 * 1000, async () => {
    const services = await listMediaServices();
    return services
      .filter(service => service.type === "sonarr" && service.enabled)
      .map(buildSonarrServerSummary);
  });

  return cacheableJsonResponseWithETag(req, { servers }, { maxAge: 60, sMaxAge: 120 });
}
