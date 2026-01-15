import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { searchJellyfinMovie, searchJellyfinSeries } from "@/lib/jellyfin-admin";
import { getTv } from "@/lib/tmdb";

const QuerySchema = z.object({
  type: z.enum(["movie", "tv"]),
  tmdbId: z.coerce.number().int(),
});

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const query = QuerySchema.parse({
    type: searchParams.get("type"),
    tmdbId: searchParams.get("tmdbId"),
  });

  try {
    if (query.type === "movie") {
      const result = await searchJellyfinMovie(query.tmdbId);
      return NextResponse.json({
        inLibrary: result?.inLibrary ?? false,
        itemId: result?.itemId,
        name: result?.name,
      });
    } else {
      // For TV, we need to get the TVDB ID from TMDB first
      const tvShow = await getTv(query.tmdbId);
      const tvdbId = tvShow?.external_ids?.tvdb_id;

      if (!tvdbId) {
        return NextResponse.json({
          inLibrary: false,
          error: "No TVDB ID found",
        });
      }

      const result = await searchJellyfinSeries(tvdbId);
      return NextResponse.json({
        inLibrary: result?.inLibrary ?? false,
        itemId: result?.itemId,
        name: result?.name,
      });
    }
  } catch (err: any) {
    return NextResponse.json({
      inLibrary: false,
      error: err?.message ?? "Library check failed",
    });
  }
}
