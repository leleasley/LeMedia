import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  createRequestWithItemsTransaction,
  upsertUser,
  findActiveEpisodeRequestItems
} from "@/db";
import { getTv, getTvExternalIds } from "@/lib/tmdb";
import {
  lookupSeriesByTvdb,
  listSeries,
  addSeriesFromLookup,
  getEpisodesForSeries,
  setEpisodeMonitored,
  episodeSearch,
  seriesSearch
} from "@/lib/sonarr";
import { notifyRequestEvent } from "@/notifications/request-events";
import { hasAssignedNotificationEndpoints } from "@/lib/notifications";
import { rejectIfMaintenance } from "@/lib/maintenance";
import { randomUUID } from "crypto";
import { requireCsrf } from "@/lib/csrf";
import asyncLock from "@/lib/async-lock";

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

type RequestedEpisode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
};

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

const Body = z.object({
  tmdbTvId: z.coerce.number().int(),
  seasonNumber: z.coerce.number().int(),
  episodeNumbers: z.array(z.coerce.number().int()).min(1),
  qualityProfileId: z.coerce.number().int().optional()
});

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const maintenance = await rejectIfMaintenance(req);
  if (maintenance) return maintenance;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const body = Body.parse(await req.json());

  const tv = await getTv(body.tmdbTvId);
  const title = tv.name ?? `TMDB TV ${body.tmdbTvId}`;
  const tvMeta = buildTvNotificationMeta(tv);

  const ext = await getTvExternalIds(body.tmdbTvId);
  const tvdbId = ext?.tvdb_id;
  if (!tvdbId) return NextResponse.json({ error: "TMDB show has no tvdb_id; Sonarr needs TVDB" }, { status: 400 });

  const dbUser = await upsertUser(user.username, user.groups);
  const hasNotifications = await hasAssignedNotificationEndpoints(dbUser.id);
  if (!hasNotifications) {
    return NextResponse.json(
      { ok: false, error: "notifications_required", message: "Requesting blocked until notifications are applied" },
      { status: 403 }
    );
  }
  let response: NextResponse | null = null;

  await asyncLock.dispatch(body.tmdbTvId, async () => {
    const existingItems = await findActiveEpisodeRequestItems({
      tmdbTvId: body.tmdbTvId,
      season: body.seasonNumber,
      episodeNumbers: body.episodeNumbers
    });
    const already = new Set(existingItems.map(i => i.episode));
    const episodeNumbers = body.episodeNumbers.filter(n => !already.has(n));
    if (episodeNumbers.length === 0) {
      const requestId = existingItems[0]?.request_id ?? null;
      response = NextResponse.json(
        {
          ok: false,
          requestId,
          error: "already_requested",
          message: `These episodes have already been requested: ${Array.from(already).sort((a, b) => a - b).map(n => `E${n}`).join(", ")}`
        },
        { status: 409 }
      );
      return;
    }

    if (!user.isAdmin) {
      const r = await createRequestWithItemsTransaction({
        requestType: "episode",
        tmdbId: body.tmdbTvId,
        title,
        userId: dbUser.id,
        requestStatus: "pending",
        items: episodeNumbers.map(ep => ({
          provider: "sonarr",
          providerId: null,
          season: body.seasonNumber,
          episode: ep,
          status: "pending"
        })),
        posterPath: tv?.poster_path ?? null,
        backdropPath: tv?.backdrop_path ?? null,
        releaseYear: tv?.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : null
      });
      await notifyRequestEvent("request_pending", {
        requestId: r.id,
        requestType: "episode",
        tmdbId: body.tmdbTvId,
        title,
        username: user.username,
        userId: dbUser.id,
        ...tvMeta
      });
      response = NextResponse.json({ ok: true, pending: true, requestId: r.id, tvdbId, count: episodeNumbers.length, skipped: already.size });
      return;
    }

    try {
      // Find or add series in Sonarr
      const existing = (await listSeries()).find((s: any) => s.tvdbId === tvdbId);
      let series = existing;
      let seriesAdded = false;

      if (!series) {
        const lookup = await lookupSeriesByTvdb(tvdbId);
        if (!Array.isArray(lookup) || lookup.length === 0) {
          throw new Error(`Sonarr lookup returned nothing for tvdb:${tvdbId}`);
        }
        // Add series unmonitored (we only monitor selected eps)
        series = await addSeriesFromLookup(lookup[0], false, body.qualityProfileId);
        seriesAdded = true;
        await seriesSearch(series.id);
      }

      const attempts = seriesAdded ? 4 : 1;
      const episodes = await waitForSeriesEpisodes(series.id, attempts);
      const wanted: RequestedEpisode[] = episodes
        .filter((e: any) => e.seasonNumber === body.seasonNumber && episodeNumbers.includes(e.episodeNumber))
        .map(
          (e: any): RequestedEpisode => ({
            id: e.id,
            seasonNumber: e.seasonNumber,
            episodeNumber: e.episodeNumber
          })
        );

      if (wanted.length === 0) throw new Error("No matching episodes found in Sonarr (series added but episodes not populated yet?)");

      const episodeIds = wanted.map((w: RequestedEpisode) => w.id);

      await setEpisodeMonitored(episodeIds, true);
      await episodeSearch(episodeIds);

      const r = await createRequestWithItemsTransaction({
        requestType: "episode",
        tmdbId: body.tmdbTvId,
        title,
        userId: dbUser.id,
        requestStatus: "queued",
        finalStatus: "submitted",
        items: wanted.map(w => ({
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
        tmdbId: body.tmdbTvId,
        title,
        username: user.username,
        userId: dbUser.id,
        ...tvMeta
      });

      response = NextResponse.json({ ok: true, requestId: r.id, sonarrSeriesId: series.id, tvdbId, count: wanted.length, skipped: already.size });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      const fakeRequestId = `failed-episodes-${body.tmdbTvId}-${randomUUID()}`;
      const event = /(already been added|already exists|already in)/i.test(msg) ? "request_already_exists" : "request_failed";
      await notifyRequestEvent(event, {
        requestId: fakeRequestId,
        requestType: "episode",
        tmdbId: body.tmdbTvId,
        title,
        username: user.username,
        userId: dbUser.id,
        ...tvMeta
      });
      response = NextResponse.json({ ok: false, error: msg }, { status: event === "request_already_exists" ? 409 : 500 });
    }
  });

  if (response) return response;
  return NextResponse.json({ ok: false, error: "Request failed" }, { status: 500 });
}
