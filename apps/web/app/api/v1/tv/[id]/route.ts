import { NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { listSonarrQualityProfiles, getSeriesByTmdbId, getSeriesByTvdbId } from "@/lib/sonarr";
import { getActiveMediaService } from "@/lib/media-services";
import { getJellyfinItemId, isAvailableByExternalIds } from "@/lib/jellyfin";
import { getJellyfinPlayUrl } from "@/lib/jellyfin-links";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { withCache } from "@/lib/local-cache";
import { getTvDetailAggregate } from "@/lib/media-aggregate";

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

const REQUESTS_REQUIRE_NOTIFICATIONS =
  (process.env.REQUESTS_REQUIRE_NOTIFICATIONS ?? "false").toLowerCase() === "true";

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const parsed = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return cacheableJsonResponseWithETag(req, { error: "Invalid tv id" }, { maxAge: 0, private: true });
  }

  const tmdbId = parsed.data.id;
  const tvdbParam = req.nextUrl.searchParams.get("tvdbId");
  const tvdbId = tvdbParam && /^\d+$/.test(tvdbParam) ? Number(tvdbParam) : undefined;
  const title = (req.nextUrl.searchParams.get("title") ?? "").trim().slice(0, 200);
  const includeDetails = req.nextUrl.searchParams.get("details") === "1";
  const currentUser = await getUser().catch(() => null);
  const isAdmin = Boolean(currentUser?.isAdmin);

  let requestsBlocked = false;
  if (REQUESTS_REQUIRE_NOTIFICATIONS && currentUser?.username) {
    requestsBlocked = await withCache(`agg:requestsBlocked:${currentUser.username}`, 60 * 1000, async () => {
      const dbUser = await getUserWithHash(currentUser.username).catch(() => null);
      if (!dbUser) return true;
      const hasNotifications = await hasAssignedNotificationEndpoints(dbUser.id);
      return !hasNotifications;
    });
  }

  let sonarrError: string | null = null;
  let qualityProfiles: any[] = [];
  let existingSeries: any = null;

  const seriesKey = tvdbId ? `agg:sonarr:series:tvdb:${tvdbId}` : `agg:sonarr:series:tmdb:${tmdbId}`;
  const [profilesResult, seriesResult] = await Promise.allSettled([
    withCache("agg:sonarr:profiles", 60 * 1000, () => listSonarrQualityProfiles().catch(() => [])),
    withCache(seriesKey, 30 * 1000, () => {
      return tvdbId ? getSeriesByTvdbId(tvdbId).catch(() => null) : getSeriesByTmdbId(tmdbId).catch(() => null);
    })
  ]);

  if (profilesResult.status === "fulfilled") {
    qualityProfiles = Array.isArray(profilesResult.value) ? profilesResult.value : [];
  } else {
    sonarrError = profilesResult.reason?.message ?? "Sonarr unavailable";
  }

  if (seriesResult.status === "fulfilled") {
    existingSeries = seriesResult.value ?? null;
  } else {
    sonarrError = sonarrError ?? (seriesResult.reason?.message ?? "Sonarr unavailable");
  }

  const existingSeriesSummary = existingSeries
    ? {
        id: existingSeries.id ?? null,
        titleSlug: existingSeries.titleSlug ?? null,
        monitored: existingSeries.monitored ?? null
      }
    : null;

  const sonarrService = await withCache(
    "agg:sonarr:service",
    60 * 1000,
    () => getActiveMediaService("sonarr").catch(() => null)
  );
  const defaultQualityProfileId = Number(
    sonarrService?.config?.qualityProfileId ??
      sonarrService?.config?.qualityProfile ??
      qualityProfiles[0]?.id ??
      0
  );

  let availableInJellyfin: boolean | null = null;
  try {
    availableInJellyfin = await isAvailableByExternalIds("tv", tmdbId, tvdbId);
  } catch {
    availableInJellyfin = null;
  }

  let playUrl: string | null = null;
  try {
    const jellyfinItemId = await getJellyfinItemId("tv", tmdbId, title || `TMDB ${tmdbId}`, tvdbId ?? null);
    playUrl = await getJellyfinPlayUrl(jellyfinItemId);
  } catch {
    playUrl = null;
  }

  const details = includeDetails ? await getTvDetailAggregate(tmdbId) : null;

  return cacheableJsonResponseWithETag(req,
    {
      tmdbId,
      tvdbId: tvdbId ?? null,
      isAdmin,
      availableInLibrary: availableInJellyfin === true || Boolean(existingSeriesSummary?.monitored),
      playUrl,
      manage: {
        itemId: isAdmin ? existingSeriesSummary?.id ?? null : null,
        slug: isAdmin ? existingSeriesSummary?.titleSlug ?? null : null,
        baseUrl: isAdmin ? sonarrService?.base_url ?? null : null
      },
      sonarr: {
        qualityProfiles,
        existingSeries: existingSeriesSummary,
        sonarrError,
        defaultQualityProfileId,
        requestsBlocked,
        availableInJellyfin
      },
      details
    },
    { maxAge: 30, sMaxAge: 60, private: true }
  );
}
