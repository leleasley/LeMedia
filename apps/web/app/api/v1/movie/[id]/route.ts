import { NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { findActiveRequestByTmdb, getUserWithHash } from "@/db";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { listRadarrQualityProfiles, getMovieByTmdbId } from "@/lib/radarr";
import { getActiveMediaService, hasActiveMediaService } from "@/lib/media-services";
import { getJellyfinItemId, isAvailableByExternalIds } from "@/lib/jellyfin";
import { getJellyfinPlayUrl } from "@/lib/jellyfin-links";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { withCache } from "@/lib/local-cache";
import { getMovieDetailAggregate } from "@/lib/media-aggregate";
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
    return cacheableJsonResponseWithETag(req, { error: "Invalid movie id" }, { maxAge: 0, private: true });
  }

  // Support both session auth (web UI) and API key auth (Wholphin/external)
  const apiKey = extractApiKey(req);
  const hasValidApiKey = apiKey ? await verifyExternalApiKey(apiKey) : false;
  const currentUser = hasValidApiKey ? null : await getUser().catch(() => null);
  const isAdmin = Boolean(currentUser?.isAdmin);

  const tmdbId = parsed.data.id;
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

  let radarrError: string | null = null;
  let qualityProfiles: any[] = [];
  let radarrMovie: any = null;

  const [profilesResult, movieResult] = await Promise.allSettled([
    withCache("agg:radarr:profiles", 60 * 1000, () => listRadarrQualityProfiles().catch(() => [])),
    withCache(`agg:radarr:movie:${tmdbId}`, 30 * 1000, () => getMovieByTmdbId(tmdbId).catch(() => null))
  ]);

  if (profilesResult.status === "fulfilled") {
    qualityProfiles = Array.isArray(profilesResult.value) ? profilesResult.value : [];
  } else {
    radarrError = profilesResult.reason?.message ?? "Radarr unavailable";
  }

  if (movieResult.status === "fulfilled") {
    radarrMovie = movieResult.value ?? null;
  } else {
    radarrError = radarrError ?? (movieResult.reason?.message ?? "Radarr unavailable");
  }

  const defaultQualityProfileId = Number(
    process.env.RADARR_QUALITY_PROFILE_ID ?? qualityProfiles[0]?.id ?? 0
  );

  const radarrMovieSummary = radarrMovie
    ? {
        id: radarrMovie.id ?? null,
        titleSlug: radarrMovie.titleSlug ?? null,
        hasFile: !!radarrMovie.hasFile,
        monitored: radarrMovie.monitored ?? null
      }
    : null;

  let manageBaseUrl: string | null = null;
  if (isAdmin) {
    const radarrService = await withCache(
      "agg:radarr:service",
      60 * 1000,
      () => getActiveMediaService("radarr").catch(() => null)
    );
    manageBaseUrl = radarrService?.base_url ?? null;
  }

  let jellyfinItemId: string | null = null;
  let playUrl: string | null = null;
  let jellyfinAvailable = false;
  try {
    jellyfinAvailable = Boolean(await isAvailableByExternalIds("movie", tmdbId));
    if (jellyfinAvailable) {
      // Use fallback strategies: TMDB ID first, then name search
      jellyfinItemId = await getJellyfinItemId("movie", tmdbId, title);
      if (jellyfinItemId) {
        playUrl = await getJellyfinPlayUrl(jellyfinItemId, "movie");
      }
    }
  } catch {
    jellyfinItemId = null;
    playUrl = null;
    jellyfinAvailable = false;
  }

  const details = includeDetails || hasValidApiKey ? await getMovieDetailAggregate(tmdbId) : null;
  const request = await withCache(
    `agg:requests:movie:${tmdbId}`,
    30 * 1000,
    () => findActiveRequestByTmdb({ requestType: "movie", tmdbId }).catch(() => null)
  );
  const prowlarrEnabled = await withCache(
    "agg:prowlarr:enabled",
    60 * 1000,
    () => hasActiveMediaService("prowlarr").catch(() => false)
  );

  // Return Overseerr-compatible format when accessed via API key
  if (hasValidApiKey && details?.movie) {
    const movie = details.movie;
    const isAvailable = jellyfinAvailable || Boolean(radarrMovieSummary?.hasFile);
    const mediaStatus = mapRequestStatusToMediaStatus(request?.status ?? null, isAvailable);
    return cacheableJsonResponseWithETag(req, {
      id: tmdbId,
      tmdbId,
      mediaType: "movie",
      adult: movie.adult ?? false,
      budget: movie.budget ?? 0,
      genres: movie.genres ?? [],
      homepage: movie.homepage ?? null,
      imdbId: movie.imdb_id ?? null,
      originalLanguage: movie.original_language ?? null,
      originalTitle: movie.original_title ?? null,
      overview: movie.overview ?? null,
      popularity: movie.popularity ?? 0,
      posterPath: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : null,
      backdropPath: movie.backdrop_path ? `https://image.tmdb.org/t/p/w780${movie.backdrop_path}` : null,
      productionCompanies: movie.production_companies ?? [],
      productionCountries: movie.production_countries ?? [],
      releaseDate: movie.release_date ?? null,
      revenue: movie.revenue ?? 0,
      runtime: movie.runtime ?? null,
      spokenLanguages: movie.spoken_languages ?? [],
      status: movie.status ?? null,
      tagline: movie.tagline ?? null,
      title: movie.title ?? null,
      video: movie.video ?? false,
      voteAverage: movie.vote_average ?? 0,
      voteCount: movie.vote_count ?? 0,
      credits: {
        cast: Array.isArray(movie.credits?.cast) ? movie.credits.cast.map(mapCreditCast) : [],
        crew: Array.isArray(movie.credits?.crew) ? movie.credits.crew.map(mapCreditCrew) : []
      },
      relatedVideos: mapRelatedVideos(movie.videos),
      collection: movie.belongs_to_collection ?? null,
      externalIds: {
        imdbId: movie.imdb_id ?? null,
        facebookId: null,
        instagramId: null,
        twitterId: null
      },
      mediaInfo: {
        id: tmdbId,
        tmdbId,
        status: mediaStatus,
        requests: request ? [{ id: uuidToNumericId(request.id), status: mapStatusToOverseerr(request.status) }] : []
      }
    }, { maxAge: 300, sMaxAge: 600 });
  }

  // Return LeMedia internal format for web UI (session auth)
  return cacheableJsonResponseWithETag(req,
    {
      tmdbId,
      isAdmin,
      availableInLibrary: jellyfinAvailable || Boolean(radarrMovieSummary?.hasFile),
      playUrl,
      request: request
        ? {
            id: request.id,
            status: request.status,
            createdAt: request.createdAt,
            requestedBy: request.requestedBy
          }
        : null,
      manage: {
        itemId: isAdmin ? radarrMovieSummary?.id ?? null : null,
        slug: isAdmin ? radarrMovieSummary?.titleSlug ?? null : null,
        baseUrl: isAdmin ? manageBaseUrl : null
      },
      radarr: {
        qualityProfiles,
        radarrMovie: radarrMovieSummary,
        radarrError,
        defaultQualityProfileId,
        requestsBlocked,
        prowlarrEnabled
      },
      details
    },
    { maxAge: 30, sMaxAge: 60, private: true }
  );
}
