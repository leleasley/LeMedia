import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getUserWithHash } from "@/db";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { listRadarrQualityProfiles, getMovieByTmdbId } from "@/lib/radarr";
import { hasActiveMediaService } from "@/lib/media-services";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const Query = z.object({ tmdbId: z.coerce.number().int() });

export async function GET(req: NextRequest) {
  const parsed = Query.safeParse({
    tmdbId: req.nextUrl.searchParams.get("tmdbId")
  });
  if (!parsed.success) {
    return jsonResponseWithETag(req, { error: "Invalid tmdbId" }, { status: 400 });
  }

  let radarrError: string | null = null;
  let qualityProfiles: any[] = [];
  let radarrMovie: any = null;

  try {
    const [profiles, movie] = await Promise.all([
      listRadarrQualityProfiles(),
      getMovieByTmdbId(parsed.data.tmdbId).catch(() => null)
    ]);
    qualityProfiles = profiles ?? [];
    radarrMovie = movie;
  } catch (err: any) {
    radarrError = err?.message ?? "Radarr unavailable";
  }

  const defaultQualityProfileId = Number(process.env.RADARR_QUALITY_PROFILE_ID ?? qualityProfiles[0]?.id ?? 0);

  let requestsBlocked = true;
  let isAdmin = false;
  try {
    const currentUser = await requireUser();
    if (currentUser instanceof NextResponse) {
      requestsBlocked = true;
    } else {
    const dbUser = await getUserWithHash(currentUser.username);
    const hasNotifications = dbUser ? await hasAssignedNotificationEndpoints(dbUser.id) : false;
    requestsBlocked = !hasNotifications;
    isAdmin = Boolean(currentUser?.isAdmin);
    }
  } catch {
    requestsBlocked = true;
  }

  const prowlarrEnabled = await hasActiveMediaService("prowlarr").catch(() => false);

  return jsonResponseWithETag(req, {
    qualityProfiles,
    radarrMovie,
    radarrError,
    defaultQualityProfileId,
    requestsBlocked,
    isAdmin,
    prowlarrEnabled
  });
}
