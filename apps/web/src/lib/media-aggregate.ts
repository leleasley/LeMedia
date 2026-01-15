import "server-only";

import { getImageProxyEnabled } from "@/lib/app-settings";
import {
  getMovieKeywords,
  getMovieReleaseDates,
  getMovieWatchProviders,
  getMovieWithCreditsAndVideos,
  getTvKeywords,
  getTvWatchProviders,
  getTvWithCreditsAndVideos
} from "@/lib/tmdb";
import { getMovieRatings, getTVRatings } from "@/lib/rottentomatoes";
import { getOmdbData } from "@/lib/omdb";
import { withCache } from "@/lib/local-cache";

const RATING_TTL_MS = 15 * 60 * 1000;
const OMDB_TTL_MS = 6 * 60 * 60 * 1000;

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

async function getOmdbRatings(imdbId: string | null) {
  if (!imdbId) return { imdbRating: null as string | null, metacriticScore: null as string | null };
  const omdbEnabled = process.env.OMDB_ENABLED !== "0";
  if (!omdbEnabled) return { imdbRating: null, metacriticScore: null };
  return withCache(`agg:omdb:${imdbId}`, OMDB_TTL_MS, async () => {
    const omdbData = await getOmdbData(imdbId).catch(() => null);
    return {
      imdbRating: omdbData?.imdbRating || null,
      metacriticScore: omdbData?.Metascore && omdbData.Metascore !== "N/A" ? omdbData.Metascore : null
    };
  });
}

export async function getMovieDetailAggregate(id: number) {
  const region = process.env.TMDB_REGION || "GB";
  const [movie, imageProxyEnabled] = await Promise.all([
    getMovieWithCreditsAndVideos(id),
    getImageProxyEnabled()
  ]);

  const title = movie.title ?? "";
  const year = movie.release_date ? Number(movie.release_date.slice(0, 4)) : null;
  const imdbId = movie.external_ids?.imdb_id ?? null;

  const [providersResult, releaseDates, keywordsResult, rtRatings, omdbRatings] = await Promise.all([
    getMovieWatchProviders(id).catch(() => null),
    getMovieReleaseDates(id).catch(() => null),
    getMovieKeywords(id).catch(() => ({ keywords: [] })),
    title && year
      ? withCache(`agg:rt:movie:${id}`, RATING_TTL_MS, () => getMovieRatings(title, year).catch(() => null))
      : Promise.resolve(null),
    getOmdbRatings(imdbId)
  ]);

  const streamingProviders = providersResult?.results?.[region]?.flatrate || [];
  const digitalReleaseDate = getDigitalReleaseDate(releaseDates, region);
  const keywords = keywordsResult?.keywords ?? [];

  return {
    movie,
    imageProxyEnabled,
    streamingProviders,
    releaseDates,
    digitalReleaseDate,
    keywords,
    ratings: {
      imdbId,
      imdbRating: omdbRatings.imdbRating,
      metacriticScore: omdbRatings.metacriticScore,
      rtCriticsScore: rtRatings?.criticsScore ?? null,
      rtCriticsRating: rtRatings?.criticsRating ?? null,
      rtAudienceScore: rtRatings?.audienceScore ?? null,
      rtAudienceRating: rtRatings?.audienceRating ?? null,
      rtUrl: rtRatings?.url ?? null
    }
  };
}

export async function getTvDetailAggregate(id: number) {
  const region = process.env.TMDB_REGION || "GB";
  const [tv, imageProxyEnabled] = await Promise.all([
    getTvWithCreditsAndVideos(id),
    getImageProxyEnabled()
  ]);

  const name = tv.name ?? "";
  const year = tv.first_air_date ? Number(tv.first_air_date.slice(0, 4)) : undefined;
  const imdbId = tv.external_ids?.imdb_id ?? null;
  const tvdbId = typeof tv.external_ids?.tvdb_id === "number" ? tv.external_ids.tvdb_id : null;

  const [providersResult, keywordsResult, rtRatings, omdbRatings] = await Promise.all([
    getTvWatchProviders(id).catch(() => null),
    getTvKeywords(id).catch(() => ({ results: [] })),
    name
      ? withCache(`agg:rt:tv:${id}`, RATING_TTL_MS, () => getTVRatings(name, year).catch(() => null))
      : Promise.resolve(null),
    getOmdbRatings(imdbId)
  ]);

  const streamingProviders = providersResult?.results?.[region]?.flatrate || [];
  const keywords = keywordsResult?.results ?? [];

  return {
    tv,
    imageProxyEnabled,
    streamingProviders,
    keywords,
    tvdbId,
    ratings: {
      imdbId,
      imdbRating: omdbRatings.imdbRating,
      metacriticScore: omdbRatings.metacriticScore,
      rtCriticsScore: rtRatings?.criticsScore ?? null,
      rtCriticsRating: rtRatings?.criticsRating ?? null,
      rtAudienceScore: rtRatings?.audienceScore ?? null,
      rtAudienceRating: rtRatings?.audienceRating ?? null,
      rtUrl: rtRatings?.url ?? null
    }
  };
}
