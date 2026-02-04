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
import { verifyExternalApiKey } from "@/lib/external-api";

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

const REQUESTS_REQUIRE_NOTIFICATIONS =
  (process.env.REQUESTS_REQUIRE_NOTIFICATIONS ?? "false").toLowerCase() === "true";

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

function buildRelatedVideoUrl(video: any) {
  if (!video?.key) return null;
  const site = String(video.site || "").toLowerCase();
  if (site === "youtube") return `https://www.youtube.com/watch?v=${video.key}`;
  if (site === "vimeo") return `https://vimeo.com/${video.key}`;
  return null;
}

function mapRelatedVideos(input: any): Array<{
  url: string | null;
  key: string | null;
  name: string | null;
  size: number | null;
  type: string | null;
  site: string | null;
}> {
  const list = Array.isArray(input?.results) ? input.results : Array.isArray(input) ? input : [];
  return list.map((video: any) => ({
    url: buildRelatedVideoUrl(video),
    key: video?.key ?? null,
    name: video?.name ?? null,
    size: typeof video?.size === "number" ? video.size : null,
    type: video?.type ?? null,
    site: video?.site ?? null
  }));
}

function mapCreditCast(credit: any) {
  return {
    id: credit?.id ?? null,
    castid: credit?.cast_id ?? null,
    character: credit?.character ?? null,
    creditId: credit?.credit_id ?? null,
    gender: credit?.gender ?? null,
    name: credit?.name ?? null,
    order: credit?.order ?? null,
    profilePath: credit?.profile_path ?? null,
    originalName: credit?.original_name ?? null,
    adult: credit?.adult ?? null,
    mediaType: credit?.media_type ?? null,
    originalLanguage: credit?.original_language ?? null,
    overview: credit?.overview ?? null,
    popularity: credit?.popularity ?? null,
    posterPath: credit?.poster_path ?? null,
    backdropPath: credit?.backdrop_path ?? null,
    firstAirDate: credit?.first_air_date ?? null,
    releaseDate: credit?.release_date ?? null,
    voteAverage: credit?.vote_average ?? null,
    voteCount: credit?.vote_count ?? null,
    genreIds: credit?.genre_ids ?? [],
    episodeCount: credit?.episode_count ?? null,
    title: credit?.title ?? null
  };
}

function mapCreditCrew(credit: any) {
  return {
    id: credit?.id ?? null,
    creditId: credit?.credit_id ?? null,
    department: credit?.department ?? null,
    job: credit?.job ?? null,
    gender: credit?.gender ?? null,
    name: credit?.name ?? null,
    profilePath: credit?.profile_path ?? null,
    originalName: credit?.original_name ?? null,
    adult: credit?.adult ?? null,
    mediaType: credit?.media_type ?? null,
    originalLanguage: credit?.original_language ?? null,
    overview: credit?.overview ?? null,
    popularity: credit?.popularity ?? null,
    posterPath: credit?.poster_path ?? null,
    backdropPath: credit?.backdrop_path ?? null,
    firstAirDate: credit?.first_air_date ?? null,
    releaseDate: credit?.release_date ?? null,
    voteAverage: credit?.vote_average ?? null,
    voteCount: credit?.vote_count ?? null,
    genreIds: credit?.genre_ids ?? [],
    episodeCount: credit?.episode_count ?? null,
    title: credit?.title ?? null
  };
}

// Convert UUID to numeric ID for Overseerr compatibility (same as request endpoint)
function uuidToNumericId(uuid: string): number {
  const hex = uuid.replace(/-/g, '').substring(0, 7);
  const num = parseInt(hex, 16);
  return num % 2147483647;
}

// Map status strings to Overseerr numeric codes
function mapStatusToOverseerr(status: string): number {
  const statusMap: Record<string, number> = {
    "pending": 1,
    "queued": 2,
    "submitted": 2,
    "downloading": 2,
    "available": 5,
    "denied": 3,
    "failed": 4,
    "already_exists": 5
  };
  return statusMap[status] ?? 1;
}

function mapRequestStatusToMediaStatus(status: string | null | undefined, available: boolean): number {
  if (available) return 5;
  switch (status) {
    case "pending":
    case "queued":
      return 2;
    case "submitted":
    case "downloading":
      return 3;
    case "available":
    case "already_exists":
      return 5;
    case "denied":
    case "failed":
      return 1;
    default:
      return 1;
  }
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const parsed = ParamsSchema.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return cacheableJsonResponseWithETag(req, { error: "Invalid tv id" }, { maxAge: 0, private: true });
  }

  // Support both session auth (web UI) and API key auth (Wholphin/external)
  const apiKey = extractApiKey(req);
  const hasValidApiKey = apiKey ? await verifyExternalApiKey(apiKey) : false;
  const currentUser = hasValidApiKey ? null : await getUser().catch(() => null);
  const isAdmin = Boolean(currentUser?.isAdmin);

  const tmdbId = parsed.data.id;
  const tvdbParam = req.nextUrl.searchParams.get("tvdbId");
  const tvdbId = tvdbParam && /^\d+$/.test(tvdbParam) ? Number(tvdbParam) : undefined;
  const title = (req.nextUrl.searchParams.get("title") ?? "").trim().slice(0, 200);
  const includeDetails = req.nextUrl.searchParams.get("details") === "1";

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

  const details = includeDetails || hasValidApiKey ? await getTvDetailAggregate(tmdbId) : null;
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

  // Return Overseerr-compatible format when accessed via API key
  if (hasValidApiKey && details?.tv) {
    const tv = details.tv;
    const isAvailable = availableInJellyfin || sonarrHasFiles;
    const mediaStatus = mapRequestStatusToMediaStatus(request?.status ?? null, isAvailable);
    return cacheableJsonResponseWithETag(req, {
      id: tmdbId,
      tmdbId,
      tvdbId: tvdbId ?? null,
      mediaType: "tv",
      adult: tv.adult ?? false,
      backdropPath: tv.backdrop_path ? `https://image.tmdb.org/t/p/w780${tv.backdrop_path}` : null,
      createdBy: tv.created_by ?? [],
      episodeRunTime: tv.episode_run_time ?? [],
      firstAirDate: tv.first_air_date ?? null,
      genres: tv.genres ?? [],
      homepage: tv.homepage ?? null,
      inProduction: tv.in_production ?? false,
      languages: tv.languages ?? [],
      lastAirDate: tv.last_air_date ?? null,
      lastEpisodeToAir: tv.last_episode_to_air ?? null,
      name: tv.name ?? null,
      nextEpisodeToAir: tv.next_episode_to_air ?? null,
      networks: tv.networks ?? [],
      numberOfEpisodes: tv.number_of_episodes ?? 0,
      numberOfSeasons: tv.number_of_seasons ?? 0,
      originCountry: tv.origin_country ?? [],
      originalLanguage: tv.original_language ?? null,
      originalName: tv.original_name ?? null,
      overview: tv.overview ?? null,
      popularity: tv.popularity ?? 0,
      posterPath: tv.poster_path ? `https://image.tmdb.org/t/p/w500${tv.poster_path}` : null,
      productionCompanies: tv.production_companies ?? [],
      productionCountries: tv.production_countries ?? [],
      seasons: tv.seasons ?? [],
      spokenLanguages: tv.spoken_languages ?? [],
      status: tv.status ?? null,
      tagline: tv.tagline ?? null,
      type: tv.type ?? null,
      voteAverage: tv.vote_average ?? 0,
      voteCount: tv.vote_count ?? 0,
      credits: {
        cast: Array.isArray(tv.credits?.cast) ? tv.credits.cast.map(mapCreditCast) : [],
        crew: Array.isArray(tv.credits?.crew) ? tv.credits.crew.map(mapCreditCrew) : []
      },
      relatedVideos: mapRelatedVideos(tv.videos),
      externalIds: {
        tvdbId: tvdbId ?? null,
        facebookId: null,
        instagramId: null,
        twitterId: null
      },
      mediaInfo: {
        id: tmdbId,
        tmdbId,
        tvdbId: tvdbId ?? null,
        status: mediaStatus,
        requests: request ? [{ id: uuidToNumericId(request.id), status: mapStatusToOverseerr(request.status) }] : []
      }
    }, { maxAge: 300, sMaxAge: 600 });
  }

  // Return LeMedia internal format for web UI (session auth)
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
