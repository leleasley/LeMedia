import "server-only";

import { getImageProxyEnabled } from "@/lib/app-settings";
import {
  getMovieKeywords,
  getMovieWatchProviders,
  getMovieWithCreditsAndVideos,
  getTvKeywords,
  getTvWatchProviders,
  getTvWithCreditsAndVideos
} from "@/lib/tmdb";

/**
 * Fast movie aggregate - only TMDB data, no slow external APIs (OMDB, Rotten Tomatoes)
 * This makes the page show immediately. External ratings can load client-side.
 */
export async function getMovieDetailAggregateFast(id: number) {
  const region = process.env.TMDB_REGION || "GB";

  // Only fetch fast TMDB data
  const [movie, imageProxyEnabled, providersResult, keywordsResult] = await Promise.all([
    getMovieWithCreditsAndVideos(id),
    getImageProxyEnabled(),
    getMovieWatchProviders(id).catch(() => null),
    getMovieKeywords(id).catch(() => ({ keywords: [] }))
  ]);

  const streamingProviders = providersResult?.results?.[region]?.flatrate || [];
  const keywords = keywordsResult?.keywords ?? [];
  const imdbId = movie.external_ids?.imdb_id ?? null;

  return {
    movie,
    imageProxyEnabled,
    streamingProviders,
    keywords,
    imdbId
  };
}

/**
 * Fast TV aggregate - only TMDB data, no slow external APIs
 */
export async function getTvDetailAggregateFast(id: number) {
  const region = process.env.TMDB_REGION || "GB";

  // Only fetch fast TMDB data
  const [tv, imageProxyEnabled, providersResult, keywordsResult] = await Promise.all([
    getTvWithCreditsAndVideos(id),
    getImageProxyEnabled(),
    getTvWatchProviders(id).catch(() => null),
    getTvKeywords(id).catch(() => ({ results: [] }))
  ]);

  const streamingProviders = providersResult?.results?.[region]?.flatrate || [];
  const keywords = keywordsResult?.results ?? [];
  const imdbId = tv.external_ids?.imdb_id ?? null;
  const tvdbId = typeof tv.external_ids?.tvdb_id === "number" ? tv.external_ids.tvdb_id : null;

  return {
    tv,
    imageProxyEnabled,
    streamingProviders,
    keywords,
    imdbId,
    tvdbId
  };
}
