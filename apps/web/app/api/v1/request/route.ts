import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  ActiveRequestExistsError,
  createRequestWithItemsTransaction,
  findActiveRequestByTmdb,
  listActiveEpisodeRequestItemsByTmdb,
  listRequestsPaged,
  getUserById,
  listRequestItems,
  getUserRequestLimitStatus
} from "@/db";
import { addMovie } from "@/lib/radarr";
import { getMovie, getTv, getTvExternalIds } from "@/lib/tmdb";
import { getJellyfinItemIdByTmdb } from "@/lib/jellyfin";
import {
  addSeriesFromLookup,
  episodeSearch,
  getEpisodesForSeries,
  listSeries,
  lookupSeriesByTvdb,
  seriesSearch,
  setEpisodeMonitored
} from "@/lib/sonarr";
import { notifyRequestEvent } from "@/notifications/request-events";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { verifyExternalApiKey } from "@/lib/external-api";
import { rejectIfMaintenance } from "@/lib/maintenance";
import { randomUUID } from "crypto";
import asyncLock from "@/lib/async-lock";
import { isAdminGroup } from "@/lib/groups";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

function mapFilter(filter: string | null) {
  switch ((filter ?? "").toLowerCase()) {
    case "approved":
    case "processing":
      return ["submitted", "downloading"];
    case "pending":
      return ["pending", "queued"];
    case "failed":
      return ["failed", "denied"];
    case "completed":
    case "available":
    case "deleted":
      return ["available"];
    case "unavailable":
      return ["pending", "queued", "submitted", "downloading"];
    default:
      return ["pending", "queued", "submitted", "downloading", "available", "denied", "failed", "already_exists"];
  }
}

function mapRequestType(mediaType: string | null) {
  const t = (mediaType ?? "").toLowerCase();
  if (t === "movie") return "movie";
  if (t === "tv") return "episode";
  return undefined;
}

const CreateSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  mediaId: z.coerce.number().int(),
  seasons: z.string().optional()
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

async function waitForSeriesEpisodes(seriesId: number, tries = 1, delayMs = 1200) {
  for (let attempt = 0; attempt < tries; attempt++) {
    const episodes = await getEpisodesForSeries(seriesId);
    if (episodes.length > 0 || attempt === tries - 1) {
      return episodes;
    }
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return [];
}

export async function GET(req: NextRequest) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take") ?? 10), 1), 100);
  const skip = Math.max(Number(req.nextUrl.searchParams.get("skip") ?? 0), 0);
  const requestedByRaw = req.nextUrl.searchParams.get("requestedBy");
  let requestedById = requestedByRaw && /^\d+$/.test(requestedByRaw) ? Number(requestedByRaw) : null;
  // If no requestedBy param, default to X-Api-User header when provided
  if (requestedById == null) {
    const apiUserHeader = req.headers.get("x-api-user") || req.headers.get("X-Api-User") || "";
    const apiUserId = Number(apiUserHeader);
    if (Number.isFinite(apiUserId) && apiUserId > 0) {
      requestedById = apiUserId;
    }
  }

  const filter = mapFilter(req.nextUrl.searchParams.get("filter"));
  const requestType = mapRequestType(req.nextUrl.searchParams.get("mediaType"));

  const { total, results } = await listRequestsPaged({
    limit: take,
    offset: skip,
    statuses: filter,
    requestType,
    requestedById
  });
  // Aggregate TV episode requests by series (tmdb_id) and attach Jellyfin ids
  const tvGroups = new Map<number, { base: typeof results[number]; requestIds: string[] }>();
  const movies: Array<typeof results[number]> = [];

  for (const r of results) {
    if (r.request_type === "episode") {
      const existing = tvGroups.get(r.tmdb_id);
      if (existing) existing.requestIds.push(r.id);
      else tvGroups.set(r.tmdb_id, { base: r, requestIds: [r.id] });
    } else {
      movies.push(r);
    }
  }

  const aggregatedTv = await Promise.all(
    Array.from(tvGroups.values()).map(async ({ base, requestIds }) => {
      const jellyfinMediaId = await getJellyfinItemIdByTmdb("tv", base.tmdb_id);
      return {
        id: base.id,
        status: base.status,
        createdAt: base.created_at,
        type: "tv" as const,
        mediaType: "tv" as const,
        title: base.title,
        tmdbId: base.tmdb_id,
        requestedBy: { id: base.user_id, username: base.username },
        media: { jellyfinMediaId: jellyfinMediaId ?? null }
      };
    })
  );

  const aggregatedMovies = await Promise.all(
    movies.map(async m => {
      const jellyfinMediaId = await getJellyfinItemIdByTmdb("movie", m.tmdb_id);
      return {
        id: m.id,
        status: m.status,
        createdAt: m.created_at,
        type: "movie" as const,
        mediaType: "movie" as const,
        title: m.title,
        tmdbId: m.tmdb_id,
        requestedBy: { id: m.user_id, username: m.username },
        media: { jellyfinMediaId: jellyfinMediaId ?? null }
      };
    })
  );

  const combined = [...aggregatedTv, ...aggregatedMovies];

  return cacheableJsonResponseWithETag(req, {
    pageInfo: {
      pages: Math.max(Math.ceil(combined.length / take), 1),
      pageSize: take,
      results: combined.length,
      page: Math.floor(skip / take) + 1
    },
    results: combined
  }, { maxAge: 30, private: true });
}

export async function POST(req: NextRequest) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maintenance = await rejectIfMaintenance(req);
  if (maintenance) return maintenance;

  const apiUserHeader = req.headers.get("x-api-user") || "";
  const apiUserId = Number(apiUserHeader);
  if (!Number.isFinite(apiUserId) || apiUserId <= 0) {
    return NextResponse.json({ error: "Missing X-Api-User header" }, { status: 400 });
  }

  const user = await getUserById(apiUserId);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const isAdmin = isAdminGroup(user.groups);
  const hasNotifications = await hasAssignedNotificationEndpoints(user.id);
  if (!hasNotifications) {
    return NextResponse.json(
      { ok: false, error: "notifications_required", message: "Requesting blocked until notifications are applied" },
      { status: 403 }
    );
  }

  if (body.data.mediaType === "movie") {
    const movie = await getMovie(body.data.mediaId);
    const title = movie?.title ?? `TMDB ${body.data.mediaId}`;
    const movieMeta = buildMovieNotificationMeta(movie);

    let response: NextResponse | null = null;

    await asyncLock.dispatch(body.data.mediaId, async () => {
      const existing = await findActiveRequestByTmdb({ requestType: "movie", tmdbId: body.data.mediaId });
      if (existing) {
        response = NextResponse.json(
          { ok: false, error: "already_requested", message: "This movie has already been requested.", requestId: existing.id },
          { status: 409 }
        );
        return;
      }

      if (!isAdmin) {
        const limitStatus = await getUserRequestLimitStatus(user.id, "movie");
        if (!limitStatus.unlimited && (limitStatus.remaining ?? 0) <= 0) {
          response = NextResponse.json(
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
          return;
        }
        const r = await createRequestWithItemsTransaction({
          requestType: "movie",
          tmdbId: body.data.mediaId,
          title,
          userId: user.id,
          requestStatus: "pending",
          items: [{ provider: "radarr", providerId: null, status: "pending" }],
          posterPath: movie?.poster_path ?? null,
          backdropPath: movie?.backdrop_path ?? null,
          releaseYear: movie?.release_date ? Number(movie.release_date.slice(0, 4)) : null
        });
        await notifyRequestEvent("request_pending", {
          requestId: r.id,
          requestType: "movie",
          tmdbId: body.data.mediaId,
          title,
          username: user.username,
          userId: user.id,
          ...movieMeta
        });
        response = NextResponse.json({ ok: true, pending: true, requestId: r.id });
        return;
      }

      try {
        const radarrMovie = await addMovie(body.data.mediaId, undefined, movie);
        const r = await createRequestWithItemsTransaction({
          requestType: "movie",
          tmdbId: body.data.mediaId,
          title,
          userId: user.id,
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
          tmdbId: body.data.mediaId,
          title,
          username: user.username,
          userId: user.id,
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
        const fakeRequestId = `failed-movie-${body.data.mediaId}-${randomUUID()}`;
        const event = /(already been added|already exists|already in)/i.test(msg) ? "request_already_exists" : "request_failed";
        await notifyRequestEvent(event, {
          requestId: fakeRequestId,
          requestType: "movie",
          tmdbId: body.data.mediaId,
          title,
          username: user.username,
          userId: user.id,
          ...movieMeta
        });
        response = NextResponse.json({ ok: false, error: msg }, { status: event === "request_already_exists" ? 409 : 500 });
      }
    });

    if (response) return response;
    return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
  }

  const tv = await getTv(body.data.mediaId);
  const title = tv?.name ?? `TMDB TV ${body.data.mediaId}`;
  const tvMeta = buildTvNotificationMeta(tv);

  const ext = await getTvExternalIds(body.data.mediaId);
  const tvdbId = ext?.tvdb_id;
  if (!tvdbId) return NextResponse.json({ error: "TMDB show has no tvdb_id; Sonarr needs TVDB" }, { status: 400 });

  let response: NextResponse | null = null;

  await asyncLock.dispatch(body.data.mediaId, async () => {
    const existingItems = await listActiveEpisodeRequestItemsByTmdb(body.data.mediaId);
    const already = new Set(existingItems.map(i => `${i.season}:${i.episode}`));

    if (!isAdmin) {
      const limitStatus = await getUserRequestLimitStatus(user.id, "episode");
      if (!limitStatus.unlimited && (limitStatus.remaining ?? 0) <= 0) {
        response = NextResponse.json(
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
        return;
      }
      try {
        const existing = (await listSeries()).find((s: any) => s.tvdbId === tvdbId);
        let series = existing;
        let seriesAdded = false;

        if (!series) {
          const lookup = await lookupSeriesByTvdb(tvdbId);
          if (!Array.isArray(lookup) || lookup.length === 0) {
            throw new Error(`Sonarr lookup returned nothing for tvdb:${tvdbId}`);
          }
          series = await addSeriesFromLookup(lookup[0], false, undefined);
          seriesAdded = true;
        }

        const attempts = seriesAdded ? 4 : 1;
        const episodes = await waitForSeriesEpisodes(series.id, attempts);
        const toRequest = episodes.filter((e: any) => !already.has(`${e.seasonNumber}:${e.episodeNumber}`));
        if (!toRequest.length) {
          response = NextResponse.json(
            { ok: false, error: "already_requested", message: "This series has already been requested." },
            { status: 409 }
          );
          return;
        }

        const r = await createRequestWithItemsTransaction({
          requestType: "episode",
          tmdbId: body.data.mediaId,
          title,
          userId: user.id,
          requestStatus: "pending",
          items: toRequest.map((ep: any) => ({
            provider: "sonarr",
            providerId: null,
            season: ep.seasonNumber,
            episode: ep.episodeNumber,
            status: "pending"
          })),
          posterPath: tv?.poster_path ?? null,
          backdropPath: tv?.backdrop_path ?? null,
          releaseYear: tv?.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : null
        });
        await notifyRequestEvent("request_pending", {
          requestId: r.id,
          requestType: "episode",
          tmdbId: body.data.mediaId,
          title,
          username: user.username,
          userId: user.id,
          ...tvMeta
        });
        response = NextResponse.json({ ok: true, pending: true, requestId: r.id, tvdbId, count: toRequest.length });
      } catch (e: any) {
        response = NextResponse.json({ ok: false, error: e?.message ?? "Request failed" }, { status: 500 });
      }
      return;
    }

    try {
      const existing = (await listSeries()).find((s: any) => s.tvdbId === tvdbId);
      let series = existing;
      let seriesAdded = false;

      if (!series) {
        const lookup = await lookupSeriesByTvdb(tvdbId);
        if (!Array.isArray(lookup) || lookup.length === 0) {
          throw new Error(`Sonarr lookup returned nothing for tvdb:${tvdbId}`);
        }
        series = await addSeriesFromLookup(lookup[0], true, undefined);
        seriesAdded = true;
        await seriesSearch(series.id);
      }

      const attempts = seriesAdded ? 4 : 1;
      const episodes = await waitForSeriesEpisodes(series.id, attempts);
      const wanted = episodes.filter((e: any) => !already.has(`${e.seasonNumber}:${e.episodeNumber}`));

      if (wanted.length === 0) {
        response = NextResponse.json(
          { ok: false, error: "already_requested", message: "This series has already been requested." },
          { status: 409 }
        );
        return;
      }

      const episodeIds = wanted.map((w: any) => w.id);
      await setEpisodeMonitored(episodeIds, true);
      await episodeSearch(episodeIds);

      const r = await createRequestWithItemsTransaction({
        requestType: "episode",
        tmdbId: body.data.mediaId,
        title,
        userId: user.id,
        requestStatus: "queued",
        finalStatus: "submitted",
        items: wanted.map((w: any) => ({
          provider: "sonarr",
          providerId: series.id,
          season: w.seasonNumber,
          episode: w.episodeNumber,
          status: "submitted"
        })),
        posterPath: tv?.poster_path ?? null,
        backdropPath: tv?.backdrop_path ?? null,
        releaseYear: tv?.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : null
      });
      await notifyRequestEvent("request_submitted", {
        requestId: r.id,
        requestType: "episode",
        tmdbId: body.data.mediaId,
        title,
        username: user.username,
        userId: user.id,
        ...tvMeta
      });

      response = NextResponse.json({ ok: true, requestId: r.id, sonarrSeriesId: series.id, tvdbId, count: wanted.length });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const fakeRequestId = `failed-episodes-${body.data.mediaId}-${randomUUID()}`;
      const event = /(already been added|already exists|already in)/i.test(msg) ? "request_already_exists" : "request_failed";
      await notifyRequestEvent(event, {
        requestId: fakeRequestId,
        requestType: "episode",
        tmdbId: body.data.mediaId,
        title,
        username: user.username,
        userId: user.id,
        ...tvMeta
      });
      response = NextResponse.json({ ok: false, error: msg }, { status: event === "request_already_exists" ? 409 : 500 });
    }
  });

  if (response) return response;
  return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
}
