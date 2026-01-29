import { NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import {
  getUserWithHash,
  getCachedJellyfinSeriesItemId,
  hasCachedEpisodeAvailability,
  getAvailableSeasons,
  findActiveRequestByTmdb,
  listActiveEpisodeRequestItemsByTmdb
} from "@/db";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { listSonarrQualityProfiles, getSeriesByTmdbId, getSeriesByTvdbId } from "@/lib/sonarr";
import { getActiveMediaService, hasActiveMediaService } from "@/lib/media-services";
import { getJellyfinItemId } from "@/lib/jellyfin";
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

  const seriesKey = `agg:sonarr:series:tv:${tmdbId}:${tvdbId ?? "none"}`;
  const seriesLookup = async () => {
    if (tvdbId) {
      const byTvdb = await getSeriesByTvdbId(tvdbId).catch(() => null);
      if (byTvdb) return byTvdb;
    }
    return getSeriesByTmdbId(tmdbId).catch(() => null);
  };
  const [profilesResult, seriesResult] = await Promise.allSettled([
    withCache("agg:sonarr:profiles", 60 * 1000, () => listSonarrQualityProfiles().catch(() => [])),
    withCache(seriesKey, 30 * 1000, () => {
      return seriesLookup();
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

  const sonarrSeasons = Array.isArray(existingSeries?.seasons) ? existingSeries.seasons : [];
  const sonarrAvailableSeasons = sonarrSeasons
    .map((season: any) => ({
      number: Number(season?.seasonNumber ?? season?.season_number ?? season?.season ?? 0),
      hasFiles: Number(season?.statistics?.episodeFileCount ?? 0) > 0 ||
        Number(season?.statistics?.sizeOnDisk ?? 0) > 0 ||
        Number(season?.sizeOnDisk ?? 0) > 0
    }))
    .filter((season: any) => Number.isFinite(season.number) && season.number > 0 && season.hasFiles)
    .map((season: any) => season.number);

  const sonarrHasFiles =
    Number(existingSeries?.statistics?.episodeFileCount ?? 0) > 0 ||
    Number(existingSeries?.statistics?.sizeOnDisk ?? 0) > 0 ||
    Number(existingSeries?.sizeOnDisk ?? 0) > 0 ||
    sonarrAvailableSeasons.length > 0;

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

  const cachedAvailable = await hasCachedEpisodeAvailability({ tmdbId, tvdbId: tvdbId ?? null }).catch(() => false);
  const availableInJellyfin = cachedAvailable ? true : false;

  const cachedSeasons = await getAvailableSeasons({ tmdbId, tvdbId: tvdbId ?? null }).catch(() => []);
  const availableSeasons = Array.from(new Set([...(cachedSeasons ?? []), ...sonarrAvailableSeasons]))
    .filter((season) => Number.isFinite(season) && season > 0)
    .sort((a, b) => a - b);

  let playUrl: string | null = null;
  if (availableInJellyfin === true) {
    try {
      const cachedSeriesId = await getCachedJellyfinSeriesItemId({ tmdbId, tvdbId: tvdbId ?? null }).catch(() => null);
      const jellyfinItemId = cachedSeriesId ?? await getJellyfinItemId("tv", tmdbId, title || `TMDB ${tmdbId}`, tvdbId ?? null);
      playUrl = await getJellyfinPlayUrl(jellyfinItemId, "tv");
    } catch {
      playUrl = null;
    }
  }

  const details = includeDetails ? await getTvDetailAggregate(tmdbId) : null;
  const request = await withCache(
    `agg:requests:tv:${tmdbId}`,
    30 * 1000,
    () => findActiveRequestByTmdb({ requestType: "episode", tmdbId }).catch(() => null)
  );
  const requestedSeasons = await withCache(
    `agg:requests:tv:seasons:${tmdbId}`,
    30 * 1000,
    async () => {
      const items = await listActiveEpisodeRequestItemsByTmdb(tmdbId).catch(() => []);
      const counts: Record<number, { requested: number }> = {};
      for (const item of items) {
        const seasonNumber = Number(item.season);
        if (!Number.isFinite(seasonNumber) || seasonNumber <= 0) continue;
        if (!counts[seasonNumber]) counts[seasonNumber] = { requested: 0 };
        counts[seasonNumber].requested += 1;
      }
      return counts;
    }
  );
  const prowlarrEnabled = await withCache(
    "agg:prowlarr:enabled",
    60 * 1000,
    () => hasActiveMediaService("prowlarr").catch(() => false)
  );

  return cacheableJsonResponseWithETag(req,
    {
      tmdbId,
      tvdbId: tvdbId ?? null,
      isAdmin,
      availableInLibrary: availableInJellyfin === true || sonarrHasFiles,
      availableSeasons,
      playUrl,
      request: request
        ? { id: request.id, status: request.status, createdAt: request.created_at }
        : null,
      requestedSeasons,
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
        availableInJellyfin,
        availableSeasons,
        prowlarrEnabled
      },
      details
    },
    { maxAge: 30, sMaxAge: 60, private: true }
  );
}
