import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { trackRecentlyViewed, getRecentlyViewed, clearRecentlyViewed, upsertUser } from "@/db";
import { z } from "zod";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { requireCsrf } from "@/lib/csrf";

const trackSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().positive(),
  title: z.string(),
  posterPath: z.string().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const { id: userId } = await upsertUser(user.username, user.groups);

    const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);
    if (isNaN(limit) || limit < 1) {
      return NextResponse.json({ error: "Invalid limit parameter" }, { status: 400 });
    }
    const items = await getRecentlyViewed(userId, limit);
    
    // Enrich with TMDB data
    const imageProxyEnabled = await getImageProxyEnabled();
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        try {
          let details;
          if (item.mediaType === "movie") {
            details = await getMovie(item.tmdbId);
          } else {
            details = await getTv(item.tmdbId);
          }
          
          return {
            userId: item.userId,
            mediaType: item.mediaType,
            tmdbId: item.tmdbId,
            title: item.mediaType === "movie" ? details.title : details.name,
            posterPath: tmdbImageUrl(details.poster_path, "w500", imageProxyEnabled),
            lastViewedAt: item.lastViewedAt,
            description: details.overview || "",
            rating: details.vote_average || 0,
            year: item.mediaType === "movie" 
              ? (details.release_date || "").slice(0, 4)
              : (details.first_air_date || "").slice(0, 4),
          };
        } catch (error) {
          // Fallback to basic data if TMDB fetch fails
          return {
            userId: item.userId,
            mediaType: item.mediaType,
            tmdbId: item.tmdbId,
            title: item.title,
            posterPath: item.posterPath,
            lastViewedAt: item.lastViewedAt,
            description: "",
            rating: 0,
            year: "",
          };
        }
      })
    );
    
    return NextResponse.json({ items: enrichedItems });
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    const { id: userId } = await upsertUser(user.username, user.groups);
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    
    const body = await req.json();
    const data = trackSchema.parse(body);
    
    await trackRecentlyViewed({
      userId,
      mediaType: data.mediaType,
      tmdbId: data.tmdbId,
      title: data.title,
      posterPath: data.posterPath ?? null,
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request data" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to track view" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser();
    const { id: userId } = await upsertUser(user.username, user.groups);
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    
    await clearRecentlyViewed(userId);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
