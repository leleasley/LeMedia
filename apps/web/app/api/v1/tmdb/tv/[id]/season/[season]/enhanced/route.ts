import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { listActiveEpisodeRequestItemsByTmdb } from "@/db";
import { isEpisodeAvailable } from "@/lib/jellyfin";
import { getTvExternalIds } from "@/lib/tmdb";

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

  // Fetch season data from TMDB
  const url = new URL(`${TMDB_BASE}/tv/${tmdbId}/season/${seasonNumber}`);
  url.searchParams.set("api_key", getTmdbApiKey());

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    return NextResponse.json({ error: "tmdb_error" }, { status: 502 });
  }

  const seasonData = await res.json();
  const episodes = seasonData.episodes || [];

  // Get TV external IDs for jellyfin lookups
  const externalIds = await getTvExternalIds(tmdbId).catch(() => null);
  const tvdbId = externalIds?.tvdb_id ?? null;

  // Get current user for request checking
  const currentUser = await getUser().catch(() => null);

  // Find all requested episodes for this TV show
  const allRequestedItems = await listActiveEpisodeRequestItemsByTmdb(tmdbId).catch(() => []);

  // Filter to only this season and create a map
  // Ensure numeric comparison by coercing to numbers (DB might return strings for some int types)
  const requestedEpisodesMap = new Map(
    allRequestedItems
      .filter(item => Number(item.season) === seasonNumber)
      .map(item => [Number(item.episode), { status: item.request_status, requestId: item.request_id }])
  );

  // Check episode availability in Jellyfin
  const enhancedEpisodes = await Promise.all(
    episodes.map(async (episode: any) => {
      const episodeNumber = episode.episode_number;
      const tmdbEpisodeId = episode.id;

      // Check if available in Jellyfin
      let available = false;
      let jellyfinItemId: string | null = null;

      try {
        const result = await isEpisodeAvailable({
          tmdbId,
          tvdbId,
          tmdbEpisodeId,
          seasonNumber,
          episodeNumber,
          seriesTitle: seasonData.name || "",
          airDate: episode.air_date,
          tvdbEpisodeId: episode.external_ids?.tvdb_id ?? null,
          seriesType: null
        });
        available = result.available;
        jellyfinItemId = result.itemId ?? null;
      } catch (err) {
        // Availability check failed, mark as not available
        available = false;
      }

      // Check if requested (use Number() for consistent comparison with map keys)
      const requestInfo = requestedEpisodesMap.get(Number(episodeNumber));

      return {
        ...episode,
        available,
        jellyfinItemId,
        requested: !!requestInfo,
        requestStatus: requestInfo?.status ?? null,
        requestId: requestInfo?.requestId ?? null
      };
    })
  );

  return NextResponse.json({
    ...seasonData,
    episodes: enhancedEpisodes
  });
}
