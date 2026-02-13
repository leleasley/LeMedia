import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { listActiveEpisodeRequestItemsByTmdb } from "@/db";
import { getCachedEpisodeAvailability } from "@/lib/jellyfin-availability-sync";
import { getEpisodesForSeries, getSeriesByTmdbId, getSeriesByTvdbId, sonarrQueue } from "@/lib/sonarr";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TmdbKeySchema = z.string().min(1);
let cachedKey: string | null = null;

function getTmdbApiKey(): string {
  if (!cachedKey) {
    const key = process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY;
    cachedKey = TmdbKeySchema.parse(key);
  }
  return cachedKey;
}

type ParamsInput = { id: string; season: string } | Promise<{ id: string; season: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function")
    return await (params as Promise<{ id: string; season: string }>);
  return params as { id: string; season: string };
}

export async function GET(
  req: NextRequest,
  { params }: { params: ParamsInput }
) {
  const resolved = await resolveParams(params);
  const tmdbId = z.coerce.number().int().parse(resolved.id);
  const seasonNumber = z.coerce.number().int().parse(resolved.season);
  const tvdbParam = req.nextUrl.searchParams.get("tvdbId");
  const tvdbId = tvdbParam && /^\d+$/.test(tvdbParam) ? Number(tvdbParam) : null;

  // Fetch season data from TMDB
  const url = new URL(`${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}`);
  url.searchParams.set("api_key", getTmdbApiKey());

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    return NextResponse.json({ error: "tmdb_error" }, { status: 502 });
  }

  const seasonData = await res.json();
  const episodes = seasonData.episodes || [];

  // Get current user for request checking
  const currentUser = await getUser().catch(() => null);

  // Find all requested episodes for this TV show (much faster than checking Jellyfin)
  const allRequestedItems = await listActiveEpisodeRequestItemsByTmdb(tmdbId).catch(() => []);

  // Filter to only this season and create a map
  const requestedEpisodesMap = new Map(
    allRequestedItems
      .filter(item => Number(item.season) === seasonNumber)
      .map(item => [Number(item.episode), { status: item.request_status, requestId: item.request_id }])
  );

  // Get cached availability from database (fast!)
  const availabilityResult = await getCachedEpisodeAvailability(tmdbId, seasonNumber, tvdbId).catch(() => ({
    byEpisode: new Map(),
    byAirDate: new Map()
  }));
  const sonarrHasFileByEpisode = new Map<number, boolean>();

  // Sonarr fallback: if availability cache lags, use Sonarr episode file flags.
  try {
    let sonarrSeries: any = null;
    if (tvdbId) {
      sonarrSeries = await getSeriesByTvdbId(tvdbId).catch(() => null);
    }
    if (!sonarrSeries) {
      sonarrSeries = await getSeriesByTmdbId(tmdbId).catch(() => null);
    }
    if (sonarrSeries?.id) {
      const sonarrEpisodes = await getEpisodesForSeries(Number(sonarrSeries.id)).catch(() => []);
      for (const ep of sonarrEpisodes) {
        const epSeason = Number(ep?.seasonNumber ?? ep?.season ?? NaN);
        const epNumber = Number(ep?.episodeNumber ?? ep?.episode ?? NaN);
        if (!Number.isFinite(epSeason) || !Number.isFinite(epNumber)) continue;
        if (epSeason !== seasonNumber) continue;
        const hasFile = Boolean(ep?.hasFile) || Number(ep?.episodeFileId ?? 0) > 0;
        if (hasFile) sonarrHasFileByEpisode.set(epNumber, true);
      }
    }
  } catch {
    // fallback is best-effort
  }

  // Enrich with Sonarr queue so downloading state always wins while active.
  const downloadingEpisodeKeys = new Set<string>();
  try {
    const queue: any = await sonarrQueue(1, 250);
    const records = Array.isArray(queue?.records) ? queue.records : [];
    for (const item of records) {
      const queueTmdbId = Number(item?.series?.tmdbId ?? item?.tmdbId ?? 0);
      if (!Number.isFinite(queueTmdbId) || queueTmdbId !== tmdbId) continue;
      const status = String(item?.status ?? item?.trackedDownloadStatus ?? "").toLowerCase();
      if (status === "completed" || status === "failed") continue;

      const episodeSource = item?.episode ?? (Array.isArray(item?.episodes) ? item.episodes[0] : null);
      const parsedFromTitle = /S(\d{1,2})E(\d{1,3})/i.exec(String(item?.title ?? ""));
      const qSeason = Number(
        episodeSource?.seasonNumber ??
          episodeSource?.season ??
          (parsedFromTitle ? parsedFromTitle[1] : NaN)
      );
      const qEpisode = Number(
        episodeSource?.episodeNumber ??
          episodeSource?.episode ??
          (parsedFromTitle ? parsedFromTitle[2] : NaN)
      );
      if (!Number.isFinite(qSeason) || !Number.isFinite(qEpisode)) continue;
      downloadingEpisodeKeys.add(`${qSeason}:${qEpisode}`);
    }
  } catch {
    // queue enrichment is best-effort
  }

  // Add request info and cached availability
  const enhancedEpisodes = episodes.map((episode: any) => {
    const episodeNumber = episode.episode_number;
    const requestInfo = requestedEpisodesMap.get(Number(episodeNumber));
    const isDownloading = downloadingEpisodeKeys.has(`${seasonNumber}:${Number(episodeNumber)}`);
    const availabilityInfo =
      availabilityResult.byEpisode.get(Number(episodeNumber)) ??
      (episode.air_date ? availabilityResult.byAirDate.get(String(episode.air_date).slice(0, 10)) : undefined);
    const availableFromSonarr = sonarrHasFileByEpisode.get(Number(episodeNumber)) === true;
    const isAvailable = Boolean(availabilityInfo?.available || availableFromSonarr);

    return {
      ...episode,
      requested: (!isAvailable && !!requestInfo) || isDownloading,
      requestStatus: isDownloading ? "downloading" : requestInfo?.status ?? null,
      downloading: isDownloading,
      requestId: requestInfo?.requestId ?? null,
      available: isAvailable,
      jellyfinItemId: availabilityInfo?.jellyfinItemId ?? null,
      plexItemId: availabilityInfo?.plexItemId ?? null
    };
  });

  return NextResponse.json(
    {
      ...seasonData,
      episodes: enhancedEpisodes
    },
    {
      headers: {
        "Cache-Control": "private, no-store"
      }
    }
  );
}
