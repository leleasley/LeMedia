import { NextRequest, NextResponse } from "next/server";
import { getMediaServiceByIdWithKey } from "@/lib/media-services";
import { buildSonarrServerSummary } from "@/lib/service-utils";
import {
  listSonarrLanguageProfilesForService,
  listSonarrQualityProfilesForService,
  listSonarrRootFoldersForService,
  listSonarrTagsForService
} from "@/lib/sonarr";
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
  if (!service || service.type !== "sonarr") {
    return cacheableJsonResponseWithETag(_req, { error: "Sonarr service not found" }, { maxAge: 0, private: true });
  }

  try {
    const details = await withCache(`service:sonarr:details:${service.id}`, 60 * 1000, async () => {
      const [profiles, rootFolders, tags, languageProfiles] = await Promise.all([
        listSonarrQualityProfilesForService(service.base_url, service.apiKey),
        listSonarrRootFoldersForService(service.base_url, service.apiKey),
        listSonarrTagsForService(service.base_url, service.apiKey),
        listSonarrLanguageProfilesForService(service.base_url, service.apiKey)
      ]);
      return { profiles, rootFolders, tags, languageProfiles };
    });

    return cacheableJsonResponseWithETag(_req, {
      server: buildSonarrServerSummary(service),
      profiles: Array.isArray(details.profiles) ? details.profiles : [],
      rootFolders: Array.isArray(details.rootFolders) ? details.rootFolders : [],
      tags: Array.isArray(details.tags) ? details.tags : [],
      languageProfiles: Array.isArray(details.languageProfiles) ? details.languageProfiles : []
    }, { maxAge: 60, sMaxAge: 120 });
  } catch (error: any) {
    return cacheableJsonResponseWithETag(_req, { error: error?.message ?? "Unable to reach Sonarr" }, { maxAge: 0, private: true });
  }
}
