import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { discoverMovies, discoverTv } from "@/lib/tmdb";
import { getPool } from "@/db";

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: "movie_release" | "tv_premiere" | "tv_episode" | "request_pending" | "request_approved";
  tmdbId?: number;
  posterPath?: string | null;
  mediaType?: "movie" | "tv";
  metadata?: any;
}

async function getReleasesInRange(start: string, end: string): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];

  try {
    const [movies, tvShows] = await Promise.all([
      discoverMovies({
        "primary_release_date.gte": start,
        "primary_release_date.lte": end,
        with_release_type: "2|3|4", // Theatrical, Digital
        sort_by: "popularity.desc"
      }),
      discoverTv({
        "first_air_date.gte": start,
        "first_air_date.lte": end,
        sort_by: "popularity.desc"
      })
    ]);

    if (movies?.results) {
      movies.results.forEach((movie: any) => {
        if (!movie.release_date) return;
        events.push({
          id: `movie-${movie.id}`,
          title: movie.title || "Untitled",
          date: movie.release_date,
          type: "movie_release",
          tmdbId: movie.id,
          posterPath: movie.poster_path,
          mediaType: "movie",
          metadata: {
            overview: movie.overview,
            voteAverage: movie.vote_average
          }
        });
      });
    }

    if (tvShows?.results) {
      tvShows.results.forEach((show: any) => {
        if (!show.first_air_date) return;
        events.push({
          id: `tv-${show.id}`,
          title: show.name || "Untitled",
          date: show.first_air_date,
          type: "tv_premiere",
          tmdbId: show.id,
          posterPath: show.poster_path,
          mediaType: "tv",
          metadata: {
            overview: show.overview,
            voteAverage: show.vote_average
          }
        });
      });
    }
  } catch (error) {
    console.error("[Calendar] Error fetching releases:", error);
  }

  return events;
}

async function getRequests(username: string): Promise<CalendarEvent[]> {
  const pool = getPool();
  const events: CalendarEvent[] = [];

  try {
    const result = await pool.query(`
      SELECT 
        mr.id,
        mr.tmdb_id,
        mr.title,
        mr.request_type,
        mr.poster_path,
        mr.created_at,
        mr.status
      FROM media_request mr
      JOIN app_user au ON mr.requested_by = au.id
      WHERE au.username = $1
        AND mr.status IN ('pending', 'approved')
      ORDER BY mr.created_at DESC
      LIMIT 50
    `, [username]);

    result.rows.forEach((row: any) => {
      events.push({
        id: `request-${row.id}`,
        title: row.title,
        date: row.created_at, // Still using created_at for requests as they track "when requested"
        type: row.status === 'approved' ? 'request_approved' : 'request_pending',
        tmdbId: row.tmdb_id,
        posterPath: row.poster_path,
        mediaType: row.request_type === 'movie' ? 'movie' : 'tv',
        metadata: {
          requestId: row.id,
          status: row.status
        }
      });
    });
  } catch (error) {
    console.error("[Calendar] Error fetching requests:", error);
  }

  return events;
}

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const searchParams = req.nextUrl.searchParams;
    
    // Default to current month if not specified
    const now = new Date();
    const start = searchParams.get("start") || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = searchParams.get("end") || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [releases, requests] = await Promise.all([
      getReleasesInRange(start, end),
      getRequests(user.username)
    ]);

    // Merge and filter
    const allEvents = [...releases, ...requests];
    
    // Filter duplicates (prefer release event over request event if on same day? No, keep both or handle in UI)
    // Actually, let's just return all and let UI filter/group.
    
    // Optional: User preferences for filtering could be applied here, 
    // but client-side filtering is often snappier for this volume of data (<200 items).

    return NextResponse.json({ events: allEvents });
  } catch (error) {
    console.error("[Calendar] Error:", error);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

