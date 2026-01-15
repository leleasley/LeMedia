import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { ActiveRequestExistsError, createRequestWithItemsTransaction, upsertUser } from "@/db";
import { addMovie, getMovieByTmdbId } from "@/lib/radarr";
import { getMovie } from "@/lib/tmdb";
import { notifyRequestEvent } from "@/notifications/request-events";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { rejectIfMaintenance } from "@/lib/maintenance";
import { randomUUID } from "crypto";
import { requireCsrf } from "@/lib/csrf";
import asyncLock from "@/lib/async-lock";

const Body = z.object({
  collectionId: z.coerce.number().int(),
  tmdbIds: z.array(z.coerce.number().int()).min(1),
  qualityProfileId: z.coerce.number().int().optional()
});

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
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const maintenance = await rejectIfMaintenance(req);
  if (maintenance) return maintenance;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const body = Body.parse(await req.json());
  const dbUser = await upsertUser(user.username, user.groups);
  const hasNotifications = await hasAssignedNotificationEndpoints(dbUser.id);
  if (!hasNotifications) {
    return NextResponse.json(
      { ok: false, error: "notifications_required", message: "Requesting blocked until notifications are applied" },
      { status: 403 }
    );
  }

  const results: Array<{ tmdbId: number; status: string; requestId?: string; error?: string }> = [];

  for (const tmdbId of body.tmdbIds) {
    let result: { tmdbId: number; status: string; requestId?: string; error?: string } | null = null;

    await asyncLock.dispatch(tmdbId, async () => {
      let movie: any = null;
      try {
        movie = await getMovie(tmdbId);
      } catch (err: any) {
        result = { tmdbId, status: "failed", error: err?.message ?? "Failed to load movie" };
        return;
      }

      const title = movie?.title ?? `TMDB ${tmdbId}`;
      const movieMeta = buildMovieNotificationMeta(movie);

      try {
        if (!user.isAdmin) {
          const r = await createRequestWithItemsTransaction({
            requestType: "movie",
            tmdbId,
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
            tmdbId,
            title,
            username: user.username,
            userId: dbUser.id,
            ...movieMeta
          });
          result = { tmdbId, status: "pending", requestId: r.id };
          return;
        }

        const existingRadarr = await getMovieByTmdbId(tmdbId).catch(() => null);
        if (existingRadarr) {
          result = { tmdbId, status: "already_exists" };
          return;
        }
        const radarrMovie = await addMovie(tmdbId, body.qualityProfileId, movie);
        const r = await createRequestWithItemsTransaction({
          requestType: "movie",
          tmdbId,
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
          tmdbId,
          title,
          username: user.username,
          userId: dbUser.id,
          ...movieMeta
        });
        result = { tmdbId, status: "submitted", requestId: r.id };
      } catch (e: any) {
        if (e instanceof ActiveRequestExistsError) {
          result = { tmdbId, status: "already_requested", requestId: e.requestId };
          return;
        }
        const msg = e?.message ?? String(e);
        const fakeRequestId = `failed-movie-${tmdbId}-${randomUUID()}`;
        const event = /(already been added|already exists|already in)/i.test(msg) ? "request_already_exists" : "request_failed";
        await notifyRequestEvent(event, {
          requestId: fakeRequestId,
          requestType: "movie",
          tmdbId,
          title,
          username: user.username,
          userId: dbUser.id,
          ...movieMeta
        });
        result = { tmdbId, status: event === "request_already_exists" ? "already_exists" : "failed", error: msg };
      }
    });

    results.push(result ?? { tmdbId, status: "failed", error: "Request failed" });
  }

  return NextResponse.json({ ok: true, collectionId: body.collectionId, results });
}
