import { NextRequest, NextResponse } from "next/server";
import { getCustomListByShareId, listCustomListItems } from "@/db";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  try {
    const shareId = req.nextUrl.searchParams.get("id");

    if (!shareId) {
      return NextResponse.json({ error: "Missing share ID" }, { status: 400 });
    }

    const list = await getCustomListByShareId(shareId);
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    const items = await listCustomListItems(list.id);
    const imageProxyEnabled = await getImageProxyEnabled();

    // Enrich items with TMDB data
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const details =
            item.mediaType === "movie"
              ? await getMovie(item.tmdbId)
              : await getTv(item.tmdbId);
          const title =
            item.mediaType === "movie"
              ? (details as any).title
              : (details as any).name;
          const year =
            item.mediaType === "movie"
              ? ((details as any).release_date ?? "").slice(0, 4)
              : ((details as any).first_air_date ?? "").slice(0, 4);
          return {
            ...item,
            title,
            posterUrl: tmdbImageUrl((details as any).poster_path, "w500", imageProxyEnabled),
            year,
            rating: (details as any).vote_average ?? 0,
            description: (details as any).overview ?? "",
          };
        } catch {
          return { ...item, title: "Unknown", posterUrl: null, year: "", rating: 0, description: "" };
        }
      })
    );

    return jsonResponseWithETag(req, {
      list: {
        id: list.id,
        name: list.name,
        description: list.description,
        itemCount: list.itemCount,
        createdAt: list.createdAt,
        coverTmdbId: list.coverTmdbId,
        coverMediaType: list.coverMediaType,
        customCoverImagePath: list.customCoverImagePath,
        updatedAt: list.updatedAt,
        mood: list.mood,
        occasion: list.occasion,
      },
      items: enrichedItems,
    });
  } catch (err) {
    return NextResponse.json({ error: "Unable to load list" }, { status: 500 });
  }
}
