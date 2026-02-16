import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  createRequestWithItemsTransaction,
  upsertUser,
  listActiveEpisodeRequestItemsByTmdb,
  findActiveRequestByTmdb,
  addRequestItem,
  markRequestStatus
} from "@/db";
import { getTv, getTvExternalIds } from "@/lib/tmdb";
import {
  lookupSeriesByTvdb,
  listSeries,
  addSeriesFromLookup,
  getEpisodesForSeries,
  setSeriesMonitoringOption,
  setEpisodeMonitored,
  episodeSearch,
  seriesSearch
} from "@/lib/sonarr";
import { getActiveMediaService } from "@/lib/media-services";
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

const SeasonSelection = z.object({
  seasonNumber: z.coerce.number().int().min(1),
  episodeNumbers: z.array(z.coerce.number().int().min(1)).min(1),
});

const MonitoringOptionSchema = z.enum([
  "all",
  "future",
  "missing",
  "existing",
  "recent",
  "pilot",
  "firstSeason",
  "lastSeason",
  "monitorSpecials",
  "unmonitorSpecials",
  "none"
]);

const SingleSeasonBody = z.object({
  tmdbTvId: z.coerce.number().int(),
  seasonNumber: z.coerce.number().int().min(1),
  episodeNumbers: z.array(z.coerce.number().int().min(1)).min(1),
  qualityProfileId: z.coerce.number().int().optional(),
  monitoringOption: MonitoringOptionSchema.optional()
});

const MultiSeasonBody = z.object({
  tmdbTvId: z.coerce.number().int(),
  seasons: z.array(SeasonSelection).min(1),
  qualityProfileId: z.coerce.number().int().optional(),
  monitoringOption: MonitoringOptionSchema.optional()
});

const Body = z.union([SingleSeasonBody, MultiSeasonBody]);

type NormalizedRequest = {
  tmdbTvId: number;
  seasons: Array<{ seasonNumber: number; episodeNumbers: number[] }>;
  qualityProfileId?: number;
  monitoringOption?: z.infer<typeof MonitoringOptionSchema>;
};

function normalizeRequestBody(body: z.infer<typeof Body>): NormalizedRequest {
  if ("seasons" in body) {
    return {
      tmdbTvId: body.tmdbTvId,
      seasons: body.seasons,
      qualityProfileId: body.qualityProfileId,
      monitoringOption: body.monitoringOption
    };
  }
  return {
    tmdbTvId: body.tmdbTvId,
    seasons: [{ seasonNumber: body.seasonNumber, episodeNumbers: body.episodeNumbers }],
    qualityProfileId: body.qualityProfileId,
    monitoringOption: body.monitoringOption
  };
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const maintenance = await rejectIfMaintenance(req);
  if (maintenance) return maintenance;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const body = normalizeRequestBody(Body.parse(await req.json()));

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
    const selectionEntries = body.seasons.flatMap((season) =>
      season.episodeNumbers.map((episodeNumber) => ({
        seasonNumber: season.seasonNumber,
        episodeNumber
      }))
    );

    const selectionMap = new Map<string, { seasonNumber: number; episodeNumber: number }>();
    for (const entry of selectionEntries) {
      if (entry.seasonNumber <= 0 || entry.episodeNumber <= 0) continue;
      const key = `${entry.seasonNumber}:${entry.episodeNumber}`;
      selectionMap.set(key, entry);
    }
    const selections = Array.from(selectionMap.values());

    if (selections.length === 0) {
      response = NextResponse.json({ ok: false, error: "invalid_selection" }, { status: 400 });
      return;
    }

    const existingItems = await listActiveEpisodeRequestItemsByTmdb(body.tmdbTvId);
    const existingMap = new Map(
      existingItems.map((item) => [
        `${Number(item.season)}:${Number(item.episode)}`,
        { requestId: item.request_id, status: item.request_status }
      ])
    );

    const skippedEpisodes = selections
      .filter((entry) => existingMap.has(`${entry.seasonNumber}:${entry.episodeNumber}`))
      .map((entry) => ({
        seasonNumber: entry.seasonNumber,
        episodeNumber: entry.episodeNumber,
        requestId: existingMap.get(`${entry.seasonNumber}:${entry.episodeNumber}`)?.requestId ?? null
      }));

    const pendingEpisodes = selections.filter(
      (entry) => !existingMap.has(`${entry.seasonNumber}:${entry.episodeNumber}`)
    );
    const existingRequest = await findActiveRequestByTmdb({ requestType: "episode", tmdbId: body.tmdbTvId });

    if (pendingEpisodes.length === 0) {
      response = NextResponse.json(
        {
          ok: false,
          error: "already_requested",
          message: "These episodes have already been requested.",
          skippedEpisodes
        },
        { status: 409 }
      );
      return;
    }

    if (!user.isAdmin) {
      let requestId: string;
      if (existingRequest?.id) {
        await Promise.all(
          pendingEpisodes.map((ep) =>
            addRequestItem({
              requestId: existingRequest.id,
              provider: "sonarr",
              providerId: null,
              season: ep.seasonNumber,
              episode: ep.episodeNumber,
              status: "pending"
            })
          )
        );
        await markRequestStatus(existingRequest.id, "pending");
        requestId = existingRequest.id;
      } else {
        const r = await createRequestWithItemsTransaction({
          requestType: "episode",
          tmdbId: body.tmdbTvId,
          title,
          userId: dbUser.id,
          requestStatus: "pending",
          items: pendingEpisodes.map(ep => ({
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
        requestId = r.id;
      }
      await notifyRequestEvent("request_pending", {
        requestId,
        requestType: "episode",
        tmdbId: body.tmdbTvId,
        title,
        username: user.username,
        userId: dbUser.id,
        ...tvMeta
      });
      response = NextResponse.json({
        ok: true,
        pending: true,
        requestId,
        tvdbId,
        count: pendingEpisodes.length,
        skipped: skippedEpisodes.length,
        skippedEpisodes
      });
      return;
    }

    try {
      // Find or add series in Sonarr
      const existing = (await listSeries()).find((s: any) => s.tvdbId === tvdbId);
      let series = existing;
      let seriesAdded = false;
      const sonarrService = await getActiveMediaService("sonarr").catch(() => null);
      const effectiveMonitoringOption = String(
        body.monitoringOption ??
        (sonarrService?.config as any)?.monitoringOption ??
        "all"
      );
      const shouldMonitorEpisodes = effectiveMonitoringOption !== "none";

      if (!series) {
        const lookup = await lookupSeriesByTvdb(tvdbId);
        if (!Array.isArray(lookup) || lookup.length === 0) {
          throw new Error(`Sonarr lookup returned nothing for tvdb:${tvdbId}`);
        }
        series = await addSeriesFromLookup(lookup[0], shouldMonitorEpisodes, body.qualityProfileId, {
          monitoringOption: effectiveMonitoringOption
        });
        seriesAdded = true;
      } else if (series.id && body.monitoringOption) {
        await setSeriesMonitoringOption(series.id, effectiveMonitoringOption).catch(() => null);
      }

      if (seriesAdded && series?.id) {
        await seriesSearch(series.id);
      }

      const attempts = seriesAdded ? 4 : 1;
      const episodes = await waitForSeriesEpisodes(series.id, attempts);
      const episodeMap = new Map<string, RequestedEpisode>();
      for (const e of episodes) {
        if (typeof e?.seasonNumber !== "number" || typeof e?.episodeNumber !== "number") continue;
        if (typeof e?.id !== "number") continue;
        episodeMap.set(`${e.seasonNumber}:${e.episodeNumber}`, {
          id: e.id,
          seasonNumber: e.seasonNumber,
          episodeNumber: e.episodeNumber
        });
      }

      const wanted: RequestedEpisode[] = [];
      const missing: Array<{ seasonNumber: number; episodeNumber: number }> = [];
      for (const entry of pendingEpisodes) {
        const match = episodeMap.get(`${entry.seasonNumber}:${entry.episodeNumber}`);
        if (match) {
          wanted.push(match);
        } else {
          missing.push({ seasonNumber: entry.seasonNumber, episodeNumber: entry.episodeNumber });
        }
      }

      if (missing.length > 0) {
        let requestId: string;
        if (existingRequest?.id) {
          await Promise.all(
            pendingEpisodes.map((ep) =>
              addRequestItem({
                requestId: existingRequest.id,
                provider: "sonarr",
                providerId: series?.id ?? null,
                season: ep.seasonNumber,
                episode: ep.episodeNumber,
                status: "pending"
              })
            )
          );
          await markRequestStatus(existingRequest.id, "pending", "No files available in Sonarr yet");
          requestId = existingRequest.id;
        } else {
          const r = await createRequestWithItemsTransaction({
            requestType: "episode",
            tmdbId: body.tmdbTvId,
            title,
            userId: dbUser.id,
            requestStatus: "pending",
            statusReason: "No files available in Sonarr yet",
            items: pendingEpisodes.map((ep) => ({
              provider: "sonarr",
              providerId: series?.id ?? null,
              season: ep.seasonNumber,
              episode: ep.episodeNumber,
              status: "pending"
            })),
            posterPath: tv?.poster_path ?? null,
            backdropPath: tv?.backdrop_path ?? null,
            releaseYear: tv?.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : null
          });
          requestId = r.id;
        }
        await notifyRequestEvent("request_pending", {
          requestId,
          requestType: "episode",
          tmdbId: body.tmdbTvId,
          title,
          username: user.username,
          userId: dbUser.id,
          ...tvMeta
        });
        response = NextResponse.json(
          {
            ok: true,
            pending: true,
            requestId,
            tvdbId,
            count: pendingEpisodes.length,
            skipped: skippedEpisodes.length,
            skippedEpisodes
          }
        );
        return;
      }

      if (wanted.length === 0) throw new Error("No matching episodes found in Sonarr (series added but episodes not populated yet?)");

      const episodeIds = wanted.map((w: RequestedEpisode) => w.id);

      await setEpisodeMonitored(episodeIds, shouldMonitorEpisodes);
      await episodeSearch(episodeIds);

      let requestId: string;
      if (existingRequest?.id) {
        await Promise.all(
          wanted.map((w) =>
            addRequestItem({
              requestId: existingRequest.id,
              provider: "sonarr",
              providerId: series.id,
              season: w.seasonNumber,
              episode: w.episodeNumber,
              status: "submitted"
            })
          )
        );
        await markRequestStatus(existingRequest.id, "submitted");
        requestId = existingRequest.id;
      } else {
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
        requestId = r.id;
      }
      await notifyRequestEvent("request_submitted", {
        requestId,
        requestType: "episode",
        tmdbId: body.tmdbTvId,
        title,
        username: user.username,
        userId: dbUser.id,
        ...tvMeta
      });

      response = NextResponse.json({
        ok: true,
        requestId,
        sonarrSeriesId: series.id,
        tvdbId,
        count: wanted.length,
        skipped: skippedEpisodes.length,
        skippedEpisodes
      });
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
