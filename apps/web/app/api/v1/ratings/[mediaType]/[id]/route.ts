import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMovieRatings, getTVRatings } from "@/lib/rottentomatoes";
import { getOmdbData } from "@/lib/omdb";
import { withCache } from "@/lib/local-cache";
import { getMovie, getTv } from "@/lib/tmdb";

const RATING_TTL_MS = 15 * 60 * 1000;
const OMDB_TTL_MS = 6 * 60 * 60 * 1000;

const ParamsSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  id: z.coerce.number().int().positive()
});

type ParamsInput = { mediaType: string; id: string } | Promise<{ mediaType: string; id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function")
    return await (params as Promise<{ mediaType: string; id: string }>);
  return params as { mediaType: string; id: string };
}

async function getOmdbRatings(imdbId: string | null) {
  if (!imdbId) return { imdbRating: null };
  const omdbEnabled = process.env.OMDB_ENABLED !== "0";
  if (!omdbEnabled) return { imdbRating: null };

  return withCache(`agg:omdb:${imdbId}`, OMDB_TTL_MS, async () => {
    const omdbData = await getOmdbData(imdbId).catch(() => null);
    return {
      imdbRating: omdbData?.imdbRating || null
    };
  });
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  try {
    const parsed = ParamsSchema.parse(await resolveParams(params));
    const { mediaType, id } = parsed;

    let title = "";
    let year: number | null = null;
    let imdbId: string | null = null;

    if (mediaType === "movie") {
      const movie = await getMovie(id);
      title = movie.title ?? "";
      year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;
      imdbId = movie.external_ids?.imdb_id ?? null;
    } else {
      const tv = await getTv(id);
      title = tv.name ?? "";
      year = tv.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : null;
      imdbId = tv.external_ids?.imdb_id ?? null;
    }

    const [rtRatings, omdbRatings] = await Promise.all([
      title && year
        ? withCache(
            `agg:rt:${mediaType}:${id}`,
            RATING_TTL_MS,
            () => (mediaType === "movie" ? getMovieRatings(title, year!) : getTVRatings(title, year)).catch(() => null)
          )
        : Promise.resolve(null),
      getOmdbRatings(imdbId)
    ]);

    const ratings = {
      imdbId,
      imdbRating: omdbRatings.imdbRating,
      rtCriticsScore: rtRatings?.criticsScore ?? null,
      rtCriticsRating: rtRatings?.criticsRating ?? null,
      rtAudienceScore: rtRatings?.audienceScore ?? null,
      rtAudienceRating: rtRatings?.audienceRating ?? null,
      rtUrl: rtRatings?.url ?? null
    };

    return NextResponse.json(
      { ratings },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800"
        }
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch ratings" },
      { status: 500 }
    );
  }
}
