import { NextRequest, NextResponse } from "next/server";
import { getMediaServiceByIdWithKey } from "@/lib/media-services";
import { buildRadarrServerSummary } from "@/lib/service-utils";
import {
  listRadarrQualityProfilesForService,
  listRadarrRootFoldersForService,
  listRadarrTagsForService
} from "@/lib/radarr";
import { withCache } from "@/lib/local-cache";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const resolvedParams = await params;
  const id = Number(resolvedParams.id);
  if (!Number.isFinite(id)) {
    return cacheableJsonResponseWithETag(_req, { error: "Invalid service id" }, { maxAge: 0, private: true });
  }

  const service = await getMediaServiceByIdWithKey(id);
  if (!service || service.type !== "radarr") {
    return cacheableJsonResponseWithETag(_req, { error: "Radarr service not found" }, { maxAge: 0, private: true });
  }

  try {
    const details = await withCache(`service:radarr:details:${service.id}`, 60 * 1000, async () => {
      const [profiles, rootFolders, tags] = await Promise.all([
        listRadarrQualityProfilesForService(service.base_url, service.apiKey),
        listRadarrRootFoldersForService(service.base_url, service.apiKey),
        listRadarrTagsForService(service.base_url, service.apiKey)
      ]);
      return { profiles, rootFolders, tags };
    });

    return cacheableJsonResponseWithETag(_req, {
      server: buildRadarrServerSummary(service),
      profiles: Array.isArray(details.profiles) ? details.profiles : [],
      rootFolders: Array.isArray(details.rootFolders) ? details.rootFolders : [],
      tags: Array.isArray(details.tags) ? details.tags : []
    }, { maxAge: 60, sMaxAge: 120 });
  } catch (error: any) {
    return cacheableJsonResponseWithETag(_req, { error: error?.message ?? "Unable to reach Radarr" }, { maxAge: 0, private: true });
  }
}
