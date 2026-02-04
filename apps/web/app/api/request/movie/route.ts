import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { ActiveRequestExistsError, createRequestWithItemsTransaction, upsertUser } from "@/db";
import { addMovie } from "@/lib/radarr";
import { getMovie } from "@/lib/tmdb";
import { notifyRequestEvent } from "@/notifications/request-events";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { rejectIfMaintenance } from "@/lib/maintenance";
import { randomUUID } from "crypto";
import { requireCsrf } from "@/lib/csrf";
import asyncLock from "@/lib/async-lock";
import { verifyExternalApiKey } from "@/lib/external-api";
import { POST as requestPost } from "../../v1/request/route";

const Body = z.object({
  tmdbId: z.coerce.number().int(),
  qualityProfileId: z.coerce.number().int().optional()
});

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

function buildMovieNotificationMeta(movie: any) {
  const posterPath = movie?.poster_path ?? null;
  const imageUrl = posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
  const rating =
    typeof movie?.vote_average === "number" && Number.isFinite(movie.vote_average)
      ? Number(movie.vote_average.toFixed(1))
      : null;
  const year =
    typeof movie?.release_date === "string" && movie.release_date
      ? Number(movie.release_date.slice(0, 4))
      : null;
  const overview = movie?.overview ?? null;
  return { imageUrl, rating, year, overview };
}

export async function POST(req: NextRequest) {
  const apiKey = extractApiKey(req);
  if (apiKey) {
    const ok = await verifyExternalApiKey(apiKey);
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const mediaIdRaw = body?.mediaId ?? body?.tmdbId ?? body?.id;
    const mediaId = Number(mediaIdRaw);
    if (!Number.isFinite(mediaId)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const headers = new Headers(req.headers);
    headers.set("content-type", "application/json");
    const proxyRequest = new NextRequest(
      new Request("http://internal/api/v1/request", {
        method: "POST",
        headers,
        body: JSON.stringify({ mediaType: "movie", mediaId })
      })
    );
    return requestPost(proxyRequest);
  }

  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const maintenance = await rejectIfMaintenance(req);
  if (maintenance) return maintenance;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const body = Body.parse(await req.json());
  const movie = await getMovie(body.tmdbId);
  const title = movie.title ?? `TMDB ${body.tmdbId}`;
  const movieMeta = buildMovieNotificationMeta(movie);

  const dbUser = await upsertUser(user.username, user.groups);
  const hasNotifications = await hasAssignedNotificationEndpoints(dbUser.id);
  if (!hasNotifications) {
    return NextResponse.json(
      { ok: false, error: "notifications_required", message: "Requesting blocked until notifications are applied" },
      { status: 403 }
    );
  }

  let response: NextResponse | null = null;

  await asyncLock.dispatch(body.tmdbId, async () => {
    try {
      if (!user.isAdmin) {
        const r = await createRequestWithItemsTransaction({
          requestType: "movie",
          tmdbId: body.tmdbId,
          title,
          userId: dbUser.id,
          requestStatus: "pending",
          items: [{ provider: "radarr", providerId: null, status: "pending" }],
          posterPath: movie?.poster_path ?? null,
          backdropPath: movie?.backdrop_path ?? null,
          releaseYear: movie?.release_date ? Number(movie.release_date.slice(0, 4)) : null
        });
        await notifyRequestEvent("request_pending", {
          requestId: r.id,
          requestType: "movie",
          tmdbId: body.tmdbId,
          title,
          username: user.username,
          userId: dbUser.id,
          ...movieMeta
        });
        response = NextResponse.json({ ok: true, pending: true, requestId: r.id });
        return;
      }

      const radarrMovie = await addMovie(body.tmdbId, body.qualityProfileId, movie);
      const r = await createRequestWithItemsTransaction({
        requestType: "movie",
        tmdbId: body.tmdbId,
        title,
        userId: dbUser.id,
        requestStatus: "queued",
        finalStatus: "submitted",
        items: [{ provider: "radarr", providerId: radarrMovie?.id ?? null, status: "submitted" }],
        posterPath: movie?.poster_path ?? null,
        backdropPath: movie?.backdrop_path ?? null,
        releaseYear: movie?.release_date ? Number(movie.release_date.slice(0, 4)) : null
      });
      await notifyRequestEvent("request_submitted", {
        requestId: r.id,
        requestType: "movie",
        tmdbId: body.tmdbId,
        title,
        username: user.username,
        userId: dbUser.id,
        ...movieMeta
      });
      response = NextResponse.json({ ok: true, requestId: r.id, radarrMovieId: radarrMovie?.id ?? null });
    } catch (e: any) {
      if (e instanceof ActiveRequestExistsError) {
        response = NextResponse.json(
          { ok: false, error: "already_requested", message: "This movie has already been requested.", requestId: e.requestId },
          { status: 409 }
        );
        return;
      }
      const msg = e?.message ?? String(e);
      const fakeRequestId = `failed-movie-${body.tmdbId}-${randomUUID()}`;
      const event = /(already been added|already exists|already in)/i.test(msg) ? "request_already_exists" : "request_failed";
      await notifyRequestEvent(event, {
        requestId: fakeRequestId,
        requestType: "movie",
        tmdbId: body.tmdbId,
        title,
        username: user.username,
        userId: dbUser.id,
        ...movieMeta
      });
      response = NextResponse.json({ ok: false, error: msg }, { status: event === "request_already_exists" ? 409 : 500 });
    }
  });

  if (response) return response;
  return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
}
