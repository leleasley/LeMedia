import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getUserWithHash, getJellyfinConfig } from "@/db";

type WatchStats = {
  totalMoviesWatched: number;
  totalEpisodesWatched: number;
  totalHoursWatched: number;
  recentMovies: Array<{
    title: string;
    watchedAt: string;
  }>;
  recentEpisodes: Array<{
    title: string;
    episode: string;
    watchedAt: string;
  }>;
};

async function getJellyfinStats(jellyfinUserId: string): Promise<WatchStats | null> {
  try {
    const config = await getJellyfinConfig();
    const jellyfinUrl = config.externalUrl || config.urlBase || process.env.JELLYFIN_BASE_URL;
    const apiKey = process.env.JELLYFIN_API_KEY; // We need a server-side admin key usually
    
    // Fallback if env var is missing but we might have it in settings? 
    // Usually JELLYFIN_API_KEY is an env var for the admin system.
    
    if (!jellyfinUrl || !apiKey) return null;

    // Fetch played items
    const response = await fetch(
      `${jellyfinUrl}/Users/${jellyfinUserId}/Items?Recursive=true&IncludeItemTypes=Movie,Episode&Filters=IsPlayed&Fields=RunTimeTicks,DateCreated,UserData&SortBy=DatePlayed&SortOrder=Descending`,
      { headers: { "X-Emby-Token": apiKey } }
    );

    if (!response.ok) return null;

    const data = await response.json();
    const items = data.Items || [];

    const movies = items.filter((i: any) => i.Type === 'Movie');
    const episodes = items.filter((i: any) => i.Type === 'Episode');

    const totalTicks = items.reduce((acc: number, item: any) => acc + (item.RunTimeTicks || 0), 0);
    // Ticks are 100-nanosecond units. 10,000,000 ticks = 1 second.
    // 1 hour = 3600 seconds = 36,000,000,000 ticks.
    const totalHoursWatched = totalTicks / 36000000000;

    const recentMovies = movies.slice(0, 5).map((m: any) => ({
      title: m.Name,
      watchedAt: m.UserData?.LastPlayedDate || m.DateCreated, // Fallback
    }));

    const recentEpisodes = episodes.slice(0, 5).map((e: any) => ({
      title: e.SeriesName || e.Name, // Series Name usually better for context
      episode: `${e.ParentIndexNumber}x${e.IndexNumber} - ${e.Name}`,
      watchedAt: e.UserData?.LastPlayedDate || e.DateCreated,
    }));

    return {
      totalMoviesWatched: movies.length,
      totalEpisodesWatched: episodes.length,
      totalHoursWatched,
      recentMovies,
      recentEpisodes,
    };
  } catch (e) {
    console.error("Jellyfin stats error:", e);
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const dbUser = await getUserWithHash(user.username);
    
    if (!dbUser || !dbUser.jellyfin_user_id) {
      // Return null or empty stats, but match structure
      return NextResponse.json(null);
    }

    const stats = await getJellyfinStats(dbUser.jellyfin_user_id);
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}