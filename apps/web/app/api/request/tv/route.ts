import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  createRequestWithItemsTransaction,
  findActiveRequestByTmdb,
  upsertUser,
  getUserRequestLimitStatus
} from "@/db";
import { getTv, getTvExternalIds } from "@/lib/tmdb";
import { addSeriesFromLookup, createSonarrFetcher, lookupSeriesByTvdbForService, seriesSearch } from "@/lib/sonarr";
import { notifyRequestEvent } from "@/notifications/request-events";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { rejectIfMaintenance } from "@/lib/maintenance";
import { randomUUID } from "crypto";
import { requireCsrf } from "@/lib/csrf";
import { getActiveMediaService, getMediaServiceByIdWithKey } from "@/lib/media-services";
import asyncLock from "@/lib/async-lock";
import { isAdminGroup } from "@/lib/groups";

const Body = z.object({
  tmdbId: z.coerce.number().int(),
  qualityProfileId: z.coerce.number().int().optional(),
  userId: z.coerce.number().int().optional(),
  serviceId: z.coerce.number().int().optional(),
  rootFolder: z.string().min(1).optional(),
  languageProfileId: z.coerce.number().int().optional(),
  tags: z.array(z.coerce.number().int()).optional(),
  monitor: z.boolean().optional()
});

const REQUESTS_REQUIRE_NOTIFICATIONS =
  (process.env.REQUESTS_REQUIRE_NOTIFICATIONS ?? "false").toLowerCase() === "true";

function buildTvNotificationMeta(tv: any) {
  const posterPath = tv?.poster_path ?? null;
  const imageUrl = posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
  const rating =
    typeof tv?.vote_average === "number" && Number.isFinite(tv.vote_average)
      ? Number(tv.vote_average.toFixed(1))
      : null;
  const year =
    typeof tv?.first_air_date === "string" && tv.first_air_date
      ? Number(tv.first_air_date.slice(0, 4))
      : null;
  const overview = tv?.overview ?? null;
  return { imageUrl, rating, year, overview };
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const maintenance = await rejectIfMaintenance(req);
    if (maintenance) return maintenance;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = Body.parse(await req.json());
  const tv = await getTv(body.tmdbId);
  const title = tv?.name ?? `TMDB ${body.tmdbId}`;
  const tvMeta = buildTvNotificationMeta(tv);

  const external = await getTvExternalIds(body.tmdbId);
  const tvdbId = external?.tvdb_id;
  if (!tvdbId) {
    return NextResponse.json({ ok: false, error: "TV series requires a TVDB id" }, { status: 400 });
  }

  let targetUserId = body.userId;
  let targetUsername = user.username;
  let targetIsAdmin = user.isAdmin;

  if (targetUserId !== undefined && targetUserId !== null) {
    if (!user.isAdmin) {
      return NextResponse.json({ ok: false, error: "forbidden", message: "Only admins can request for other users" }, { status: 403 });
    }
    const { getUserById } = await import("@/db");
    const targetUser = await getUserById(targetUserId);
    if (!targetUser) {
      return NextResponse.json({ ok: false, error: "user_not_found", message: "Target user not found" }, { status: 404 });
    }
    targetUsername = targetUser.username;
    targetIsAdmin = isAdminGroup(targetUser.groups);
  } else {
    const dbUser = await upsertUser(user.username, user.groups);
    targetUserId = dbUser.id;
  }

  const hasNotifications = await hasAssignedNotificationEndpoints(targetUserId);
  if (REQUESTS_REQUIRE_NOTIFICATIONS && !hasNotifications) {
    return NextResponse.json({ ok: false, error: "notifications_required", message: "Requesting blocked until notifications are applied" }, { status: 403 });
  }

  if (!targetIsAdmin) {
    const limitStatus = await getUserRequestLimitStatus(targetUserId, "episode");
    if (!limitStatus.unlimited && (limitStatus.remaining ?? 0) <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "limit_reached",
          message: `Request limit reached (${limitStatus.limit} per ${limitStatus.days} days).`,
          limit: limitStatus.limit,
          remaining: limitStatus.remaining,
          days: limitStatus.days
        },
        { status: 429 }
      );
    }
  }

  let response: NextResponse | null = null;

  await asyncLock.dispatch(body.tmdbId, async () => {
    const existing = await findActiveRequestByTmdb({ requestType: "episode", tmdbId: body.tmdbId });
    if (existing) {
      response = NextResponse.json(
        { ok: false, error: "already_requested", message: "This series has already been requested or is queued.", requestId: existing.id },
        { status: 409 }
      );
      return;
    }

    if (!user.isAdmin) {
      const pendingRequest = await createRequestWithItemsTransaction({
        requestType: "episode",
        tmdbId: body.tmdbId,
        title,
        userId: targetUserId,
        requestStatus: "pending",
        items: [{ provider: "sonarr", providerId: null, status: "pending" }],
        posterPath: tv?.poster_path ?? null,
        backdropPath: tv?.backdrop_path ?? null,
        releaseYear: tv?.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : null
      });
      await notifyRequestEvent("request_pending", {
        requestId: pendingRequest.id,
        requestType: "episode",
        tmdbId: body.tmdbId,
        title,
        username: targetUsername,
        userId: targetUserId,
        ...tvMeta
      });
      response = NextResponse.json({ ok: true, pending: true, requestId: pendingRequest.id });
      return;
    }

    const serviceId = body.serviceId;
    const sonarrService = serviceId && serviceId > 0 ? await getMediaServiceByIdWithKey(serviceId) : await getActiveMediaService("sonarr");
    if (!sonarrService) {
      response = NextResponse.json({ ok: false, error: "No Sonarr service is configured" }, { status: 404 });
      return;
    }

    try {
      const lookup = await lookupSeriesByTvdbForService(sonarrService.base_url, sonarrService.apiKey, tvdbId);
      if (!Array.isArray(lookup) || lookup.length === 0) {
        response = NextResponse.json({ ok: false, error: "Sonarr lookup returned no results" }, { status: 404 });
        return;
      }

      const lookupResult = lookup[0];
      const series = await addSeriesFromLookup(lookupResult, body.monitor ?? true, body.qualityProfileId, {
        serviceId: sonarrService.id,
        rootFolder: body.rootFolder,
        tags: body.tags,
        languageProfileId: body.languageProfileId
      });

      const fetcher = createSonarrFetcher(sonarrService.base_url, sonarrService.apiKey);
      if (series?.id) {
        await seriesSearch(series.id, fetcher);
      }

      const request = await createRequestWithItemsTransaction({
        requestType: "episode",
        tmdbId: body.tmdbId,
        title,
        userId: targetUserId,
        requestStatus: "queued",
        finalStatus: "submitted",
        items: [{ provider: "sonarr", providerId: series?.id ?? null, status: "submitted" }],
        posterPath: tv?.poster_path ?? null,
        backdropPath: tv?.backdrop_path ?? null,
        releaseYear: tv?.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : null
      });
      await notifyRequestEvent("request_submitted", {
        requestId: request.id,
        requestType: "episode",
        tmdbId: body.tmdbId,
        title,
        username: targetUsername,
        userId: targetUserId,
        sonarrSeriesId: series?.id ?? null,
        tvdbId,
        ...tvMeta
      });
      response = NextResponse.json({ ok: true, requestId: request.id, sonarrSeriesId: series?.id ?? null, tvdbId });
    } catch (error: any) {
      const message = error?.message ?? String(error);
      const fakeRequestId = `failed-tv-${body.tmdbId}-${randomUUID()}`;
      const event = /(already been added|already exists|already in)/i.test(message) ? "request_already_exists" : "request_failed";
      await notifyRequestEvent(event, {
        requestId: fakeRequestId,
        requestType: "episode",
        tmdbId: body.tmdbId,
        title,
        username: targetUsername,
        userId: targetUserId,
        ...tvMeta
      });
      response = NextResponse.json({ ok: false, error: message }, { status: event === "request_already_exists" ? 409 : 500 });
    }
  });

    if (response) return response;
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Invalid request data", details: error.issues }, { status: 400 });
    }
    const message = error?.message ?? String(error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
