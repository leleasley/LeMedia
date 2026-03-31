import { NextRequest, NextResponse } from "next/server";
import { getPartyWithContext, resolveWatchPartyId } from "@/db/watch-party";
import { getJellyfinItemId, listAvailableSeriesEpisodes } from "@/lib/jellyfin";
import { resolveDbUser } from "../../_shared";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> | { partyId: string } }
) {
  const { response, dbUser } = await resolveDbUser();
  if (response) return response;

  const resolved = await Promise.resolve(params);
  const partyIdentifier = String(resolved.partyId || "").trim();
  const partyId = await resolveWatchPartyId(partyIdentifier);
  if (!partyId) return NextResponse.json({ error: "Invalid party id" }, { status: 400 });

  const context = await getPartyWithContext(partyId, dbUser.id);
  if (!context?.participant || !context.party) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (context.party.mediaType !== "tv") {
    return NextResponse.json({ episodes: [], seasons: [] });
  }

  let seriesItemId = context.party.jellyfinItemId;
  if (!seriesItemId) {
    seriesItemId = await getJellyfinItemId("tv", context.party.tmdbId, context.party.mediaTitle, null);
  }

  if (!seriesItemId) {
    return NextResponse.json({ episodes: [], seasons: [] });
  }

  const episodes = await listAvailableSeriesEpisodes(seriesItemId, 2000);
  const seasons = Array.from(new Set(episodes.map((episode) => episode.seasonNumber))).sort((a, b) => a - b);

  return NextResponse.json({
    seasons,
    episodes,
    selected: {
      seasonNumber: context.party.selectedSeasonNumber,
      episodeNumber: context.party.selectedEpisodeNumber,
      episodeTitle: context.party.selectedEpisodeTitle,
      jellyfinItemId: context.party.selectedJellyfinItemId,
    },
  });
}
