import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getMovie, getMovieWatchProviders, getMovieReleaseDates } from "@/lib/tmdb";
import { getMovieRatings } from "@/lib/rottentomatoes";
import { getOmdbData } from "@/lib/omdb";
import { enforceRateLimit } from "@/lib/rate-limit";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const Params = z.object({ id: z.coerce.number().int() });
const mediaInfoRateLimit = { windowMs: 60 * 1000, max: 60 };

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") {
    return await (params as Promise<{ id: string }>);
  }
  return params as { id: string };
}

function getDigitalReleaseDate(releaseDates: any, region: string) {
  if (!releaseDates?.results) return undefined;
  for (const country of releaseDates.results) {
    if (country.iso_3166_1 === region || country.iso_3166_1 === "US") {
      const digitalRelease = country.release_dates?.find((rd: any) => rd.type === 4);
      if (digitalRelease?.release_date) {
        return digitalRelease.release_date.split("T")[0];
      }
    }
  }
  return undefined;
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const rateLimit = enforceRateLimit(req, "media-info", mediaInfoRateLimit);
  if (rateLimit) return rateLimit;
  const parsed = Params.safeParse(await resolveParams(params));
  if (!parsed.success) {
    return jsonResponseWithETag(req, { error: "Invalid id" }, { status: 400 });
  }

  const movie = await getMovie(parsed.data.id);
  const region = process.env.TMDB_REGION || "GB";
  const title = movie.title;
  const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : new Date().getFullYear();

  const [providersResult, releaseDates, rtRatings] = await Promise.all([
    getMovieWatchProviders(parsed.data.id).catch(() => null),
    getMovieReleaseDates(parsed.data.id).catch(() => null),
    title ? getMovieRatings(title, year).catch(() => null) : Promise.resolve(null)
  ]);

  let omdbData: any = null;
  let imdbRating: string | null = null;
  let metacriticScore: string | null = null;
  const imdbId = movie.external_ids?.imdb_id;
  const omdbEnabled = process.env.OMDB_ENABLED !== "0";
  if (omdbEnabled && imdbId) {
    try {
      omdbData = await getOmdbData(imdbId).catch(() => null);
      imdbRating = omdbData?.imdbRating || null;
      metacriticScore = omdbData?.Metascore && omdbData.Metascore !== "N/A" ? omdbData.Metascore : null;
    } catch {
      // ignore
    }
  }

  const streamingProviders = providersResult?.results?.[region]?.flatrate || [];
  const digitalReleaseDate = getDigitalReleaseDate(releaseDates, region);

  return jsonResponseWithETag(req, {
    streamingProviders,
    releaseDates,
    digitalReleaseDate,
    imdbId,
    imdbRating,
    metacriticScore,
    rtCriticsScore: rtRatings?.criticsScore ?? null,
    rtCriticsRating: rtRatings?.criticsRating ?? null,
    rtAudienceScore: rtRatings?.audienceScore ?? null,
    rtAudienceRating: rtRatings?.audienceRating ?? null,
    rtUrl: rtRatings?.url ?? null
  });
}
