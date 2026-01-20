import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { listSonarrQualityProfiles, getSeriesByTmdbId, getSeriesByTvdbId } from "@/lib/sonarr";
import { getActiveMediaService } from "@/lib/media-services";
import { isAvailableByExternalIds } from "@/lib/jellyfin";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const Query = z.object({
  tmdbId: z.coerce.number().int(),
  tvdbId: z.coerce.number().int().optional()
});

export async function GET(req: NextRequest) {
  const parsed = Query.safeParse({
    tmdbId: req.nextUrl.searchParams.get("tmdbId"),
    tvdbId: req.nextUrl.searchParams.get("tvdbId") ?? undefined
  });
  if (!parsed.success) {
    return jsonResponseWithETag(req, { error: "Invalid tmdbId" }, { status: 400 });
  }

  let sonarrError: string | null = null;
  let qualityProfiles: any[] = [];
  let existingSeries: any = null;

  try {
    const [profiles, existing] = await Promise.all([
      listSonarrQualityProfiles(),
      (async () => {
        if (parsed.data.tvdbId) {
          const byTvdb = await getSeriesByTvdbId(parsed.data.tvdbId).catch(() => null);
          if (byTvdb) return byTvdb;
        }
        return getSeriesByTmdbId(parsed.data.tmdbId).catch(() => null);
      })()
    ]);
    qualityProfiles = profiles ?? [];
    existingSeries = existing;
  } catch (err: any) {
    sonarrError = err?.message ?? "Sonarr unavailable";
  }

  const sonarrService = await getActiveMediaService("sonarr").catch(() => null);
  const defaultQualityProfileId = Number(
    sonarrService?.config?.qualityProfileId ??
    sonarrService?.config?.qualityProfile ??
    qualityProfiles[0]?.id ??
    0
  );

  let requestsBlocked = true;
  try {
    const currentUser = await requireUser();
    if (currentUser instanceof NextResponse) {
      requestsBlocked = true;
    } else {
    const dbUser = await getUserWithHash(currentUser.username);
    const hasNotifications = dbUser ? await hasAssignedNotificationEndpoints(dbUser.id) : false;
    requestsBlocked = !hasNotifications;
    }
  } catch {
    requestsBlocked = true;
  }

  let availableInJellyfin: boolean | null = null;
  try {
    availableInJellyfin = await isAvailableByExternalIds("tv", parsed.data.tmdbId, parsed.data.tvdbId);
  } catch {
    availableInJellyfin = null;
  }

  return jsonResponseWithETag(req, {
    qualityProfiles,
    existingSeries,
    sonarrError,
    defaultQualityProfileId,
    requestsBlocked,
    availableInJellyfin
  });
}
