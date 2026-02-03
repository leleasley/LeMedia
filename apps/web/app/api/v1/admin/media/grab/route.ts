import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getActiveMediaService } from "@/lib/media-services";
import { createProwlarrFetcher } from "@/lib/prowlarr";
import { addMovie, createRadarrFetcher, getMovieByTmdbId } from "@/lib/radarr";
import { addSeriesFromLookup, createSonarrFetcher, getSeriesByTmdbId, getSeriesByTvdbId, lookupSeriesByTvdb } from "@/lib/sonarr";

export const dynamic = "force-dynamic";

const GrabSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  mediaId: z.number().int().optional(),
  tmdbId: z.number().int().optional(),
  tvdbId: z.number().int().optional(),
  guid: z.string().min(1).optional(),
  indexerId: z.number().int().optional(),
  downloadUrl: z.string().url().optional(),
  title: z.string().optional(),
  protocol: z.string().optional(),
  preferProwlarr: z.boolean().optional()
}).refine((data) => data.mediaId || data.tmdbId || data.tvdbId, {
  message: "Missing media identifier"
});

function buildGrabPayload(input: z.infer<typeof GrabSchema>) {
  const payload: Record<string, unknown> = {
    guid: input.guid,
    indexerId: input.indexerId,
    downloadUrl: input.downloadUrl,
    title: input.title,
    protocol: input.protocol,
    movieId: input.mediaType === "movie" ? input.mediaId : undefined,
    seriesId: input.mediaType === "tv" ? input.mediaId : undefined
  };

  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin instanceof NextResponse) return admin;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = GrabSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.issues }, { status: 400 });
  }

  if (!parsed.data.guid && !parsed.data.downloadUrl) {
    return NextResponse.json({ error: "Missing release identifier" }, { status: 400 });
  }

  try {
    if (parsed.data.mediaType === "movie") {
      const service = await getActiveMediaService("radarr");
      if (!service) return NextResponse.json({ error: "No Radarr service configured" }, { status: 400 });
      const fetcher = createRadarrFetcher(service.base_url, service.apiKey);
      let mediaId = parsed.data.mediaId ?? null;
      if (!mediaId && parsed.data.tmdbId) {
        const movie = await getMovieByTmdbId(parsed.data.tmdbId).catch(() => null);
        mediaId = movie?.id ?? null;
      }
      let added = false;
      if (!mediaId) {
        if (!parsed.data.tmdbId) {
          return NextResponse.json({ error: "Movie not found in Radarr" }, { status: 404 });
        }
        const addedMovie = await addMovie(parsed.data.tmdbId).catch(() => null);
        added = Boolean(addedMovie?.id);
        mediaId = addedMovie?.id ?? null;
        if (!mediaId) {
          return NextResponse.json({ error: "Movie not found in Radarr" }, { status: 404 });
        }
      }
      if (parsed.data.preferProwlarr) {
        const prowlarr = await getActiveMediaService("prowlarr");
        if (!prowlarr) return NextResponse.json({ error: "No Prowlarr service configured" }, { status: 400 });
        if (!parsed.data.guid || !parsed.data.indexerId) {
          return NextResponse.json({ error: "Missing Prowlarr release identifier" }, { status: 400 });
        }
        const prowlarrFetcher = createProwlarrFetcher(prowlarr.base_url, prowlarr.apiKey);
        await prowlarrFetcher("/api/v1/search", {
          method: "POST",
          body: JSON.stringify({ guid: parsed.data.guid, indexerId: parsed.data.indexerId })
        });
        return NextResponse.json({ ok: true, message: added ? "Movie added and release queued" : "Release queued successfully" });
      }
      await fetcher("/api/v3/release", {
        method: "POST",
        body: JSON.stringify(buildGrabPayload({ ...parsed.data, mediaId }))
      });
      return NextResponse.json({ ok: true, message: added ? "Movie added and release queued" : "Release queued successfully" });
    }

    const service = await getActiveMediaService("sonarr");
    if (!service) return NextResponse.json({ error: "No Sonarr service configured" }, { status: 400 });
    const fetcher = createSonarrFetcher(service.base_url, service.apiKey);
    let mediaId = parsed.data.mediaId ?? null;
    if (!mediaId && (parsed.data.tvdbId || parsed.data.tmdbId)) {
      const byTvdb = parsed.data.tvdbId ? await getSeriesByTvdbId(parsed.data.tvdbId).catch(() => null) : null;
      const byTmdb = !byTvdb && parsed.data.tmdbId ? await getSeriesByTmdbId(parsed.data.tmdbId).catch(() => null) : null;
      mediaId = (byTvdb ?? byTmdb)?.id ?? null;
    }
    let added = false;
    if (!mediaId) {
      if (!parsed.data.tvdbId && !parsed.data.tmdbId) {
        return NextResponse.json({ error: "Series not found in Sonarr" }, { status: 404 });
      }
      let lookup: any = null;
      if (parsed.data.tvdbId) {
        const results = await lookupSeriesByTvdb(parsed.data.tvdbId).catch(() => []);
        lookup = Array.isArray(results) ? results[0] : null;
      }
      if (!lookup && parsed.data.tmdbId) {
        const response = await fetcher(`/api/v3/series/lookup?term=${encodeURIComponent(`tmdb:${parsed.data.tmdbId}`)}`).catch(() => null);
        lookup = Array.isArray(response) ? response[0] : null;
      }
      if (!lookup) {
        return NextResponse.json({ error: "Series not found in Sonarr" }, { status: 404 });
      }
      const addedSeries = await addSeriesFromLookup(lookup, true).catch(() => null);
      added = Boolean(addedSeries?.id);
      mediaId = addedSeries?.id ?? null;
      if (!mediaId) {
        return NextResponse.json({ error: "Series not found in Sonarr" }, { status: 404 });
      }
    }
    if (parsed.data.preferProwlarr) {
      const prowlarr = await getActiveMediaService("prowlarr");
      if (!prowlarr) return NextResponse.json({ error: "No Prowlarr service configured" }, { status: 400 });
      if (!parsed.data.guid || !parsed.data.indexerId) {
        return NextResponse.json({ error: "Missing Prowlarr release identifier" }, { status: 400 });
      }
      const prowlarrFetcher = createProwlarrFetcher(prowlarr.base_url, prowlarr.apiKey);
      await prowlarrFetcher("/api/v1/search", {
        method: "POST",
        body: JSON.stringify({ guid: parsed.data.guid, indexerId: parsed.data.indexerId })
      });
      return NextResponse.json({ ok: true, message: added ? "Series added and release queued" : "Release queued successfully" });
    }
    await fetcher("/api/v3/release", {
      method: "POST",
      body: JSON.stringify(buildGrabPayload({ ...parsed.data, mediaId }))
    });
    return NextResponse.json({ ok: true, message: added ? "Series added and release queued" : "Release queued successfully" });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Failed to grab release" }, { status: 500 });
  }
}
