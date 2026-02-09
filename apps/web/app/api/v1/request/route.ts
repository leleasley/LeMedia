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
  getUserRequestLimitStatus,
  listUsers
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
import { getExternalApiAuth } from "@/lib/external-api";
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
      return ["queued", "submitted", "downloading"];
    case "pending":
      return ["pending"];
    case "failed":
      return ["failed", "denied"];
    case "completed":
    case "available":
    case "deleted":
      return ["available", "already_exists"];
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

// Map LeMedia status strings to Overseerr status numbers for API compatibility
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

// Convert media type to Overseerr format
function mapMediaTypeToOverseerr(type: string) {
  if (type === "episode") return "tv";
  return type;
}

// Map request status to Overseerr media status numbers
function mapRequestStatusToMediaStatus(status: string): number {
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
    default:
      return 1;
  }
}

// Convert UUID to a consistent numeric ID for Overseerr compatibility
// Must fit in 32-bit signed integer range (-2,147,483,648 to 2,147,483,647)
function uuidToNumericId(uuid: string): number {
  // Take first 7 hex chars and parse, ensuring it fits in int32 range
  const hex = uuid.replace(/-/g, '').substring(0, 7);
  const num = parseInt(hex, 16);
  // Keep it positive and within int32 range (max 2,147,483,647)
  return num % 2147483647;
}

async function resolveApiUser(req: NextRequest, fallbackUserId?: number | null) {
  if (fallbackUserId && Number.isFinite(fallbackUserId)) {
    const user = await getUserById(Number(fallbackUserId));
    if (user) return user;
  }
  const apiUserHeader = req.headers.get("x-api-user") || "";
  const apiUserId = Number(apiUserHeader);
  if (Number.isFinite(apiUserId) && apiUserId > 0) {
    const user = await getUserById(apiUserId);
    if (user) return user;
  }

  const users = await listUsers();
  const admin = users.find(u => isAdminGroup(u.groups));
  return admin ?? users[0] ?? null;
}

const CreateSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  mediaId: z.coerce.number().int(),
  seasons: z.union([z.string(), z.array(z.coerce.number().int()), z.coerce.number().int()]).optional()
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

async function buildMediaRequestResponse(input: {
  requestId: string;
  status: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  user: { id: number; username: string };
  createdAt?: string | null;
}) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const jellyfinMediaId = await getJellyfinItemIdByTmdb(input.mediaType, input.tmdbId);
  return {
    id: uuidToNumericId(input.requestId),
    requestId: input.requestId,
    status: mapStatusToOverseerr(input.status),
    statusText: input.status,
    createdAt,
    updatedAt: createdAt,
    type: input.mediaType,
    mediaType: input.mediaType,
    title: input.title,
    tmdbId: input.tmdbId,
    requestedBy: {
      id: input.user.id,
      username: input.user.username,
      displayName: input.user.username
    },
    modifiedBy: null,
    is4k: false,
    serverId: null,
    profileId: null,
    rootFolder: null,
    media: {
      id: input.tmdbId,
      jellyfinMediaId: jellyfinMediaId ?? null,
      tmdbId: input.tmdbId,
      mediaType: input.mediaType,
      status: mapRequestStatusToMediaStatus(input.status)
    }
  };
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
  const auth = apiKey ? await getExternalApiAuth(apiKey) : { ok: false, isGlobal: false, userId: null };
  if (!auth.ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const take = Math.min(Math.max(Number(req.nextUrl.searchParams.get("take") ?? 100), 1), 100);
  const skip = Math.max(Number(req.nextUrl.searchParams.get("skip") ?? 0), 0);
  const requestedByRaw = req.nextUrl.searchParams.get("requestedBy");
  let requestedById = requestedByRaw && /^\d+$/.test(requestedByRaw) ? Number(requestedByRaw) : null;
  if (requestedById == null && auth.userId) {
    requestedById = auth.userId;
  }
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
        id: uuidToNumericId(base.id), // Overseerr expects numeric ID
        requestId: base.id, // Keep UUID for reference
        status: mapStatusToOverseerr(base.status), // Overseerr expects numeric status
        statusText: base.status, // Keep text status for reference
        createdAt: base.created_at,
        updatedAt: base.created_at,
        type: "tv" as const,
        mediaType: "tv" as const,
        title: base.title,
        tmdbId: base.tmdb_id,
        requestedBy: {
          id: base.user_id,
          username: base.username,
          displayName: base.username
        },
        modifiedBy: null,
        is4k: false,
        serverId: null,
        profileId: null,
        rootFolder: null,
        media: {
          id: base.tmdb_id,
          jellyfinMediaId: jellyfinMediaId ?? null,
          tmdbId: base.tmdb_id,
          mediaType: "tv",
          status: mapStatusToOverseerr(base.status)
        }
      };
    })
  );

  const aggregatedMovies = await Promise.all(
    movies.map(async m => {
      const jellyfinMediaId = await getJellyfinItemIdByTmdb("movie", m.tmdb_id);
      return {
        id: uuidToNumericId(m.id), // Overseerr expects numeric ID
        requestId: m.id, // Keep UUID for reference
        status: mapStatusToOverseerr(m.status), // Overseerr expects numeric status
        statusText: m.status, // Keep text status for reference
        createdAt: m.created_at,
        updatedAt: m.created_at,
        type: "movie" as const,
        mediaType: "movie" as const,
        title: m.title,
        tmdbId: m.tmdb_id,
        requestedBy: {
          id: m.user_id,
          username: m.username,
          displayName: m.username
        },
        modifiedBy: null,
        is4k: false,
        serverId: null,
        profileId: null,
        rootFolder: null,
        media: {
          id: m.tmdb_id,
          jellyfinMediaId: jellyfinMediaId ?? null,
          tmdbId: m.tmdb_id,
          mediaType: "movie",
          status: mapStatusToOverseerr(m.status)
        }
      };
    })
  );

  const combined = [...aggregatedTv, ...aggregatedMovies];

  return cacheableJsonResponseWithETag(req, {
    pageInfo: {
      pages: Math.max(Math.ceil(total / take), 1),
      pageSize: take,
      results: total,
      page: Math.floor(skip / take) + 1
    },
    results: combined
  }, { maxAge: 30, private: true });
}

export async function POST(req: NextRequest) {
  const apiKey = extractApiKey(req);
  const auth = apiKey ? await getExternalApiAuth(apiKey) : { ok: false, isGlobal: false, userId: null };
  if (!auth.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const usingApiKey = auth.ok;

  const maintenance = await rejectIfMaintenance(req);
  if (maintenance) return maintenance;

  const user = await resolveApiUser(req, auth.userId ?? null);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const isAdmin = isAdminGroup(user.groups);
  const canAutoApprove = isAdmin;
  const hasNotifications = await hasAssignedNotificationEndpoints(user.id);
  if (!hasNotifications && !usingApiKey) {
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
          await buildMediaRequestResponse({
            requestId: existing.id,
            status: existing.status,
            mediaType: "movie",
            tmdbId: body.data.mediaId,
            title,
            user,
            createdAt: existing.createdAt
          }),
          { status: 409 }
        );
        return;
      }

      if (!canAutoApprove) {
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
        response = NextResponse.json(
          await buildMediaRequestResponse({
            requestId: r.id,
            status: "pending",
            mediaType: "movie",
            tmdbId: body.data.mediaId,
            title,
            user
          })
        );
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
        response = NextResponse.json(
          await buildMediaRequestResponse({
            requestId: r.id,
            status: "submitted",
            mediaType: "movie",
            tmdbId: body.data.mediaId,
            title,
            user
          })
        );
      } catch (e: any) {
        if (e instanceof ActiveRequestExistsError) {
          const existing = await findActiveRequestByTmdb({ requestType: "movie", tmdbId: body.data.mediaId });
          if (existing) {
            response = NextResponse.json(
              await buildMediaRequestResponse({
                requestId: existing.id,
                status: existing.status,
                mediaType: "movie",
                tmdbId: body.data.mediaId,
                title,
                user,
                createdAt: existing.createdAt
              }),
              { status: 409 }
            );
            return;
          }
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

    if (!canAutoApprove) {
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
          const existing = await findActiveRequestByTmdb({ requestType: "episode", tmdbId: body.data.mediaId });
          if (existing) {
            response = NextResponse.json(
              await buildMediaRequestResponse({
                requestId: existing.id,
                status: existing.status,
                mediaType: "tv",
                tmdbId: body.data.mediaId,
                title,
                user,
                createdAt: existing.createdAt
              }),
              { status: 409 }
            );
          } else {
            response = NextResponse.json(
              { ok: false, error: "already_requested", message: "This series has already been requested." },
              { status: 409 }
            );
          }
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
        response = NextResponse.json(
          await buildMediaRequestResponse({
            requestId: r.id,
            status: "pending",
            mediaType: "tv",
            tmdbId: body.data.mediaId,
            title,
            user
          })
        );
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
        const existing = await findActiveRequestByTmdb({ requestType: "episode", tmdbId: body.data.mediaId });
        if (existing) {
          response = NextResponse.json(
            await buildMediaRequestResponse({
              requestId: existing.id,
              status: existing.status,
              mediaType: "tv",
              tmdbId: body.data.mediaId,
              title,
              user,
              createdAt: existing.createdAt
            }),
            { status: 409 }
          );
        } else {
          response = NextResponse.json(
            { ok: false, error: "already_requested", message: "This series has already been requested." },
            { status: 409 }
          );
        }
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

      response = NextResponse.json(
        await buildMediaRequestResponse({
          requestId: r.id,
          status: "submitted",
          mediaType: "tv",
          tmdbId: body.data.mediaId,
          title,
          user
        })
      );
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
