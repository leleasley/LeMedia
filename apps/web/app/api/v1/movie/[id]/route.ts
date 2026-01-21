import { NextRequest } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { listRadarrQualityProfiles, getMovieByTmdbId } from "@/lib/radarr";
import { getActiveMediaService } from "@/lib/media-services";
import { getJellyfinItemId, isAvailableByExternalIds } from "@/lib/jellyfin";
import { getJellyfinPlayUrl } from "@/lib/jellyfin-links";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { withCache } from "@/lib/local-cache";
import { getMovieDetailAggregate } from "@/lib/media-aggregate";

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
    return cacheableJsonResponseWithETag(req, { error: "Invalid movie id" }, { maxAge: 0, private: true });
  }

  const tmdbId = parsed.data.id;
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

  const details = includeDetails ? await getMovieDetailAggregate(tmdbId) : null;

  return cacheableJsonResponseWithETag(req,
    {
      tmdbId,
      isAdmin,
      availableInLibrary: jellyfinAvailable || Boolean(radarrMovieSummary?.hasFile),
      playUrl,
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
        requestsBlocked
      },
      details
    },
    { maxAge: 30, sMaxAge: 60, private: true }
  );
}
