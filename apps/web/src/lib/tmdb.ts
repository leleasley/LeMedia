import "server-only";
import { z } from "zod";
import ExternalAPI from "@/lib/external-api";
import { tmdbImageUrl } from "./tmdb-images";
import cacheManager from "@/lib/cache-manager";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TmdbKeySchema = z.string().min(1);

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

class TmdbApi extends ExternalAPI {
  public getRolling<T>(
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    ttlSeconds?: number
  ): Promise<T> {
    return super.getRolling<T>(endpoint, { params }, ttlSeconds);
  }
}

const tmdbCache = cacheManager.getCache("tmdb", {
  stdTTL: Math.ceil(DEFAULT_TTL_MS / 1000),
  checkperiod: 600,
});
let tmdbClient: TmdbApi | null = null;

function getTmdbClient() {
  if (tmdbClient) return tmdbClient;
  const apiKey = TmdbKeySchema.parse(process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY);
  tmdbClient = new TmdbApi(
    TMDB_BASE,
    { api_key: apiKey },
    {
      nodeCache: tmdbCache,
      rateLimit: {
        maxRequests: Math.max(1, Number(process.env.TMDB_RATE_LIMIT_REQUESTS ?? "20") || 20),
        maxRPS: Math.max(1, Number(process.env.TMDB_RATE_LIMIT_RPS ?? "50") || 50),
      },
    }
  );
  return tmdbClient;
}

async function tmdbGet<T = any>(
  path: string,
  params: Record<string, string | number | boolean | undefined> = {},
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const ttlSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
  return getTmdbClient().getRolling<T>(path, params, ttlSeconds);
}

export async function getTmdbConfig() {
  const cfg = await tmdbGet("/configuration", {}, ONE_DAY_MS);
  return cfg as { images: { secure_base_url: string; poster_sizes: string[]; backdrop_sizes: string[] } };
}

export { tmdbImageUrl };

export async function searchMulti(query: string, page = 1) {
  return tmdbGet("/search/multi", { query, page, include_adult: false });
}

export async function searchPerson(query: string, page = 1) {
  return tmdbGet("/search/person", { query, page, include_adult: false });
}

export async function getMovie(id: number) {
  return tmdbGet(`/movie/${id}`, { append_to_response: "images,external_ids" }, SIX_HOURS_MS);
}

export async function getMovieWithCreditsAndVideos(id: number) {
  return tmdbGet(`/movie/${id}`, { append_to_response: "images,external_ids,videos,credits" }, SIX_HOURS_MS);
}

export async function getMovieKeywords(id: number) {
  return tmdbGet(`/movie/${id}/keywords`, {}, SIX_HOURS_MS);
}

export async function getTv(id: number) {
  return tmdbGet(`/tv/${id}`, { append_to_response: "images,external_ids" }, TWO_HOURS_MS);
}

export async function findTvByTvdbId(tvdbId: number) {
  return tmdbGet(`/find/${tvdbId}`, { external_source: "tvdb_id" }, TWELVE_HOURS_MS);
}

export async function getPerson(id: number) {
  return tmdbGet(`/person/${id}`, { append_to_response: "images" }, SIX_HOURS_MS);
}

export async function getPersonCombinedCredits(id: number) {
  return tmdbGet(`/person/${id}/combined_credits`, {}, SIX_HOURS_MS);
}

export async function getTvWithCreditsAndVideos(id: number) {
  return tmdbGet(`/tv/${id}`, { append_to_response: "images,external_ids,videos,credits,aggregate_credits" }, TWO_HOURS_MS);
}

export async function getTvKeywords(id: number) {
  return tmdbGet(`/tv/${id}/keywords`, {}, TWO_HOURS_MS);
}

export async function getTvWithVideos(id: number) {
  return tmdbGet(`/tv/${id}`, { append_to_response: "images,external_ids,videos" }, TWO_HOURS_MS);
}

export async function getTvExternalIds(id: number): Promise<{ tvdb_id?: number | null }> {
  // TV Series External IDs endpoint
  return tmdbGet(`/tv/${id}/external_ids`, {}, ONE_DAY_MS);
}

export async function getMovieExternalIds(id: number): Promise<{ imdb_id?: string | null }> {
  return tmdbGet(`/movie/${id}/external_ids`, {}, ONE_DAY_MS);
}

export async function getCollection(id: number) {
  return tmdbGet(`/collection/${id}`, {}, SIX_HOURS_MS);
}

export async function getPopularMovies(page = 1) {
  return tmdbGet("/movie/popular", { page }, 2 * 60 * 1000);
}

export async function getPopularTv(page = 1) {
  return tmdbGet("/tv/popular", { page }, 2 * 60 * 1000);
}

export async function getTopRatedMovies(page = 1) {
  return tmdbGet("/movie/top_rated", { page }, 2 * 60 * 1000);
}

export async function getTopRatedTv(page = 1) {
  return tmdbGet("/tv/top_rated", { page }, 2 * 60 * 1000);
}

export async function getNowPlayingMovies(page = 1) {
  return tmdbGet("/movie/now_playing", { page }, 2 * 60 * 1000);
}

export async function getUpcomingMovies(page = 1) {
  return tmdbGet("/movie/upcoming", { page }, 2 * 60 * 1000);
}

export async function getUpcomingMoviesAccurate(page = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const region = (process.env.TMDB_REGION || "GB").trim();
  const language = (process.env.TMDB_LANGUAGE || "en-GB").trim();
  const params: Record<string, string | number | boolean> = {
    page,
    region,
    language,
    include_adult: false,
    sort_by: "release_date.asc",
    // The following must use dotted keys which tmdbGet will pass through
  };
  // Filter to future releases in the chosen region and typical theatrical types
  params["release_date.gte"] = today;
  params["with_release_type"] = "2|3|4"; // include digital releases too (4=Digital)
  return tmdbGet("/discover/movie", params, 2 * 60 * 1000);
}

export async function getUpcomingMoviesAccurateCombined(page = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const language = (process.env.TMDB_LANGUAGE || "en-GB").trim();
  const baseParams: Record<string, string | number | boolean> = {
    page,
    language,
    include_adult: false,
    sort_by: "release_date.asc",
  };
  baseParams["release_date.gte"] = today;
  baseParams["with_release_type"] = "2|3|4";

  const [gb, us] = await Promise.all([
    tmdbGet("/discover/movie", { ...baseParams, region: "GB" }, 2 * 60 * 1000),
    tmdbGet("/discover/movie", { ...baseParams, region: "US", language: "en-US" }, 2 * 60 * 1000)
  ]);
  const seen = new Set<number>();
  const combined = [...(gb.results ?? []), ...(us.results ?? [])].filter((m: any) => {
    if (!m?.id) return false;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  }).sort((a: any, b: any) => String(a.release_date).localeCompare(String(b.release_date)));

  return { results: combined } as { results: any[] };
}

export async function getUpcomingMoviesUkLatest(page = 1) {
  const today = new Date().toISOString().slice(0, 10);
  const language = (process.env.TMDB_LANGUAGE || "en-GB").trim();
  // Prioritize UK latest by popularity and recent release dates
  const data = await tmdbGet("/discover/movie", {
    page,
    region: "GB",
    language,
    include_adult: false,
    sort_by: "popularity.desc",
    // dotted params
    // only upcoming or just released
    // some Jellyseerr lists show very recent releases too
    // we include >= today; if that yields too few, callers can page further
    ["release_date.gte"]: today,
    ["with_release_type"]: "2|3|4"
  } as any, 2 * 60 * 1000);

  // Sort again by release_date desc within popularity to surface newest
  const results = (data.results ?? []).slice().sort((a: any, b: any) => {
    const rdA = String(a.release_date);
    const rdB = String(b.release_date);
    const popCmp = (b.popularity ?? 0) - (a.popularity ?? 0);
    if (popCmp !== 0) return popCmp;
    return rdB.localeCompare(rdA);
  });
  return { ...data, results } as { results: any[]; total_pages?: number; total_results?: number; page?: number };
}

export async function getUpcomingTvAccurate(page = 1) {
  const today = new Date().toISOString().slice(0, 10);
  
  // Get date 3 months from now to avoid showing shows too far in the future
  const threeMonthsFromNow = new Date();
  threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3);
  const maxDate = threeMonthsFromNow.toISOString().slice(0, 10);
  
  const language = (process.env.TMDB_LANGUAGE || "en-GB").trim();

  const params: Record<string, string | number | boolean> = {
    page,
    language,
    include_adult: false,
    sort_by: "popularity.desc", // Sort by popularity to get most relevant upcoming shows
    "first_air_date.gte": today,
    "first_air_date.lte": maxDate, // Limit to next 3 months
    with_status: "0|2", // Only show returning series and upcoming shows (not ended/cancelled)
  };

  return tmdbGet("/discover/tv", params, 2 * 60 * 1000);
}

export async function getTrendingAll(page = 1) {
  return tmdbGet("/trending/all/week", { page }, 2 * 60 * 1000);
}

export async function getMoviesByGenre(genreId: number, page = 1) {
  return tmdbGet("/discover/movie", { with_genres: genreId, page }, 2 * 60 * 1000);
}

export async function getTvByGenre(genreId: number, page = 1) {
  return tmdbGet("/discover/tv", { with_genres: genreId, page }, 2 * 60 * 1000);
}

export async function discoverMovies(params: Record<string, string | number | boolean | undefined>, page = 1) {
  const language = (process.env.TMDB_LANGUAGE || "en-GB").trim();
  const region = (process.env.TMDB_REGION || "").trim();
  return tmdbGet(
    "/discover/movie",
    { page, include_adult: false, language, ...(region ? { region } : {}), ...params },
    2 * 60 * 1000
  );
}

export async function discoverTv(params: Record<string, string | number | boolean | undefined>, page = 1) {
  const language = (process.env.TMDB_LANGUAGE || "en-GB").trim();
  return tmdbGet(
    "/discover/tv",
    { page, include_adult: false, language, ...params },
    2 * 60 * 1000
  );
}

export async function getLanguages() {
  return tmdbGet("/configuration/languages", {}, ONE_DAY_MS);
}

export async function getRegions() {
  return tmdbGet("/configuration/countries", {}, ONE_DAY_MS);
}

export async function getWatchProviders(type: "movie" | "tv", region?: string) {
  const params: Record<string, string> = {};
  if (region) params.watch_region = region;
  return tmdbGet(`/watch/providers/${type}`, params, TWELVE_HOURS_MS);
}

export async function searchCompanies(query: string, page = 1) {
  return tmdbGet("/search/company", { query, page }, 10 * 60 * 1000);
}

export async function searchKeywords(query: string, page = 1) {
  return tmdbGet("/search/keyword", { query, page }, 10 * 60 * 1000);
}

// Fetch watch providers (streaming services) for a movie
export async function getMovieWatchProviders(id: number) {
  return tmdbGet(`/movie/${id}/watch/providers`, {}, TWELVE_HOURS_MS);
}

// Fetch watch providers for a TV show
export async function getTvWatchProviders(id: number) {
  return tmdbGet(`/tv/${id}/watch/providers`, {}, TWELVE_HOURS_MS);
}

// Fetch release dates for a movie (includes digital, theatrical, etc.)
export async function getMovieReleaseDates(id: number) {
  return tmdbGet(`/movie/${id}/release_dates`, {}, SIX_HOURS_MS);
}

// Get content ratings for TV shows
export async function getTvContentRatings(id: number) {
  return tmdbGet(`/tv/${id}/content_ratings`, {}, SIX_HOURS_MS);
}

// Get recommendations for a movie
export async function getMovieRecommendations(id: number, page = 1) {
  return tmdbGet(`/movie/${id}/recommendations`, { page }, 10 * 60 * 1000);
}

// Get similar movies
export async function getSimilarMovies(id: number, page = 1) {
  return tmdbGet(`/movie/${id}/similar`, { page }, 10 * 60 * 1000);
}

// Get recommendations for a TV show
export async function getTvRecommendations(id: number, page = 1) {
  return tmdbGet(`/tv/${id}/recommendations`, { page }, 10 * 60 * 1000);
}

// Get similar TV shows
export async function getSimilarTv(id: number, page = 1) {
  return tmdbGet(`/tv/${id}/similar`, { page }, 10 * 60 * 1000);
}

// Get network details
export async function getNetwork(id: number) {
  return tmdbGet(`/network/${id}`, {}, ONE_DAY_MS);
}

// Get TV shows by network
export async function getTvByNetwork(networkId: number, page = 1) {
  return tmdbGet("/discover/tv", { with_networks: networkId, page, sort_by: "popularity.desc" }, 2 * 60 * 1000);
}

// Get TV season details
export async function getTvSeason(tvId: number, seasonNumber: number) {
  return tmdbGet(`/tv/${tvId}/season/${seasonNumber}`, {}, TWO_HOURS_MS);
}

// Get episodes for a TV season
export async function getTvSeasonEpisodes(tvId: number, seasonNumber: number) {
  const season = await getTvSeason(tvId, seasonNumber);
  return season?.episodes || [];
}

// Get upcoming episodes for a TV show within a date range
export async function getUpcomingEpisodesForShow(tvId: number, startDate: string, endDate: string) {
  const show = await getTvWithCreditsAndVideos(tvId);
  type SeasonSummary = { season_number: number };
  const seasons = (show?.seasons || []) as Array<Partial<SeasonSummary>>;

  const episodePromises = seasons
    .filter((s): s is SeasonSummary => typeof s.season_number === "number" && s.season_number > 0) // Exclude specials (season 0)
    .map(s => getTvSeasonEpisodes(tvId, s.season_number));

  const allSeasons = await Promise.all(episodePromises);
  const allEpisodes = allSeasons.flat();

  return allEpisodes.filter(ep => {
    if (!ep.air_date) return false;
    return ep.air_date >= startDate && ep.air_date <= endDate;
  });
}
