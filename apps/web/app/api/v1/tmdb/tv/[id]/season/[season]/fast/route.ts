import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { listActiveEpisodeRequestItemsByTmdb } from "@/db";
import { getCachedEpisodeAvailability } from "@/lib/jellyfin-availability-sync";

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

  // Add request info and cached availability
  const enhancedEpisodes = episodes.map((episode: any) => {
    const episodeNumber = episode.episode_number;
    const requestInfo = requestedEpisodesMap.get(Number(episodeNumber));
    const availabilityInfo =
      availabilityResult.byEpisode.get(Number(episodeNumber)) ??
      (episode.air_date ? availabilityResult.byAirDate.get(String(episode.air_date).slice(0, 10)) : undefined);

    return {
      ...episode,
      requested: !!requestInfo,
      requestStatus: requestInfo?.status ?? null,
      requestId: requestInfo?.requestId ?? null,
      available: availabilityInfo?.available ?? false,
      jellyfinItemId: availabilityInfo?.jellyfinItemId ?? null
    };
  });

  return NextResponse.json(
    {
      ...seasonData,
      episodes: enhancedEpisodes
    },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600'
      }
    }
  );
}
