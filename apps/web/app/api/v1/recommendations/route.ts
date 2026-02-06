import { NextRequest } from "next/server";
import { requireUser } from "@/auth";
import {
  getUserByUsername,
  upsertUser,
  listUserMediaList,
  getRecentlyViewed,
  listUserReviewsForUser,
  listRequestsByUsername
} from "@/db";
import {
  getMovie,
  getTv,
  getMovieRecommendations,
  getTvRecommendations,
  getSimilarMovies,
  getSimilarTv,
  getTrendingAll,
  getPopularMovies,
  getPopularTv,
  tmdbImageUrl
} from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { cacheableJsonResponseWithETag, jsonResponseWithETag } from "@/lib/api-optimization";
import { getPersonalizedRecommendations } from "@/lib/jellyfin-watch";

export const dynamic = "force-dynamic";

type MediaType = "movie" | "tv";
type SortBy = "rating" | "popularity" | "year";
type RecommendationMode = "personalized" | "trending";

type Seed = {
  tmdbId: number;
  mediaType: MediaType;
  weight: number;
  source: string;
};

type Candidate = {
  tmdbId: number;
  mediaType: MediaType;
  score: number;
  seedSource?: string;
  seedId?: number;
  seedRating?: number;
};

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 60;
const SEED_LIMIT = 12;
const RECS_PER_SEED = 6;

const keyFor = (mediaType: MediaType, tmdbId: number) => `${mediaType}:${tmdbId}`;

async function fetchSeedRecommendations(seed: Seed): Promise<number[]> {
  try {
    if (seed.mediaType === "movie") {
      const recs = await getMovieRecommendations(seed.tmdbId);
      const results = Array.isArray(recs?.results) ? recs.results : [];
      if (results.length > 0) return results.slice(0, RECS_PER_SEED).map((r: any) => r.id as number);
      const similar = await getSimilarMovies(seed.tmdbId);
      const similarResults = Array.isArray(similar?.results) ? similar.results : [];
      return similarResults.slice(0, RECS_PER_SEED).map((r: any) => r.id as number);
    }

    const recs = await getTvRecommendations(seed.tmdbId);
    const results = Array.isArray(recs?.results) ? recs.results : [];
    if (results.length > 0) return results.slice(0, RECS_PER_SEED).map((r: any) => r.id as number);
    const similar = await getSimilarTv(seed.tmdbId);
    const similarResults = Array.isArray(similar?.results) ? similar.results : [];
    return similarResults.slice(0, RECS_PER_SEED).map((r: any) => r.id as number);
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const limitParam = req.nextUrl.searchParams.get("limit");
  const offsetParam = req.nextUrl.searchParams.get("offset");
  const modeParam = (req.nextUrl.searchParams.get("mode") || "personalized") as RecommendationMode;
  const mediaTypeParam = req.nextUrl.searchParams.get("mediaType");
  const genreParam = req.nextUrl.searchParams.get("genre");
  const sortParam = (req.nextUrl.searchParams.get("sort") || "rating") as SortBy;
  const searchParam = req.nextUrl.searchParams.get("search");

  const limit = Math.min(Math.max(Number(limitParam ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(Number(offsetParam ?? 0) || 0, 0);
  const totalNeeded = offset + limit + 1;
  const selectedGenres = genreParam ? genreParam.split(",").map(g => parseInt(g)) : [];

  try {
    const [imageProxyEnabled, dbUser] = await Promise.all([
      getImageProxyEnabled(),
      getUserByUsername(user.username)
    ]);

    const userRecord = dbUser ?? (await upsertUser(user.username, user.groups));
    const userId = userRecord.id;
    const jellyfinUserId = (dbUser?.jellyfin_user_id ?? null) as string | null;

    // Trending mode
    if (modeParam === "trending") {
      const [trending, popularMovies, popularTv] = await Promise.all([
        getTrendingAll().catch(() => null),
        getPopularMovies().catch(() => null),
        getPopularTv().catch(() => null)
      ]);

      let trendingItems: Array<{ tmdbId: number; mediaType: MediaType; popularity: number }> = [];
      (trending?.results ?? []).forEach((item: any) => {
        if (item?.media_type === "movie" || item?.media_type === "tv") {
          trendingItems.push({ tmdbId: item.id, mediaType: item.media_type, popularity: item.popularity || 0 });
        }
      });
      (popularMovies?.results ?? []).forEach((item: any) => trendingItems.push({ tmdbId: item.id, mediaType: "movie", popularity: item.popularity || 0 }));
      (popularTv?.results ?? []).forEach((item: any) => trendingItems.push({ tmdbId: item.id, mediaType: "tv", popularity: item.popularity || 0 }));

      const seen = new Set<string>();
      trendingItems = trendingItems.filter(item => {
        const key = keyFor(item.mediaType, item.tmdbId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      if (mediaTypeParam) {
        trendingItems = trendingItems.filter(item => item.mediaType === mediaTypeParam);
      }

      trendingItems.sort((a, b) => b.popularity - a.popularity);
      const needed = limit + 1;
      const items: any[] = [];

      for (let i = offset; i < trendingItems.length && items.length < needed; i++) {
        const item = trendingItems[i];
        try {
          if (item.mediaType === "movie") {
            const movie = await getMovie(item.tmdbId);
            if (!movie) continue;
            const filtered = {
              id: item.tmdbId,
              title: movie.title ?? "Untitled",
              posterUrl: tmdbImageUrl(movie.poster_path, "w500", imageProxyEnabled),
              year: (movie.release_date ?? "").slice(0, 4),
              rating: movie.vote_average ?? 0,
              description: movie.overview ?? "",
              type: "movie" as const,
              genres: movie.genres?.map((g: any) => g.id) ?? [],
              popularity: movie.popularity || 0,
              explanation: "Trending now"
            };
            if (selectedGenres.length > 0 && !selectedGenres.some(g => filtered.genres.includes(g))) continue;
            if (searchParam && !filtered.title.toLowerCase().includes(searchParam.toLowerCase())) continue;
            items.push(filtered);
          } else {
            const tv = await getTv(item.tmdbId);
            if (!tv) continue;
            const filtered = {
              id: item.tmdbId,
              title: tv.name ?? "Untitled",
              posterUrl: tmdbImageUrl(tv.poster_path, "w500", imageProxyEnabled),
              year: (tv.first_air_date ?? "").slice(0, 4),
              rating: tv.vote_average ?? 0,
              description: tv.overview ?? "",
              type: "tv" as const,
              genres: tv.genres?.map((g: any) => g.id) ?? [],
              popularity: tv.popularity || 0,
              explanation: "Trending now"
            };
            if (selectedGenres.length > 0 && !selectedGenres.some(g => filtered.genres.includes(g))) continue;
            if (searchParam && !filtered.title.toLowerCase().includes(searchParam.toLowerCase())) continue;
            items.push(filtered);
          }
        } catch {
        }
      }

      const hasMore = items.length > limit;
      return cacheableJsonResponseWithETag(req, { items: items.slice(0, limit), hasMore }, { maxAge: 60, sMaxAge: 0, private: true });
    }

    // Personalized mode
    const [favorites, watchlist, recent, reviews, requests] = await Promise.all([
      listUserMediaList({ userId, listType: "favorite", limit: 20 }),
      listUserMediaList({ userId, listType: "watchlist", limit: 20 }),
      getRecentlyViewed(userId, 20),
      listUserReviewsForUser({ userId, minRating: 4, limit: 20 }),
      listRequestsByUsername(user.username, 200)
    ]);

    const excluded = new Set<string>();
    const seedMap = new Map<string, Seed>();
    const seedTitles = new Map<string, { title: string; rating?: number }>();

    const addSeed = (mediaType: MediaType, tmdbId: number, weight: number, source: string, title?: string, rating?: number) => {
      const key = keyFor(mediaType, tmdbId);
      excluded.add(key);
      const existing = seedMap.get(key);
      if (!existing || existing.weight < weight) {
        seedMap.set(key, { tmdbId, mediaType, weight, source });
        if (title) seedTitles.set(key, { title, rating });
      }
    };

    favorites.forEach(item => addSeed(item.media_type, item.tmdb_id, 5, "favorite"));
    watchlist.forEach(item => addSeed(item.media_type, item.tmdb_id, 3, "watchlist"));
    recent.forEach(item => addSeed(item.mediaType, item.tmdbId, 2, "recent"));
    reviews.forEach(item => addSeed(item.mediaType, item.tmdbId, item.rating >= 5 ? 4 : 3, "review", undefined, item.rating));

    requests.forEach(item => {
      const mediaType: MediaType = item.request_type === "movie" ? "movie" : "tv";
      excluded.add(keyFor(mediaType, item.tmdb_id));
    });

    if (jellyfinUserId) {
      const jellyfinSeeds = await getPersonalizedRecommendations(jellyfinUserId, 12).catch(() => []);
      jellyfinSeeds.forEach((entry) => {
        const tmdbId = entry?.ProviderIds?.Tmdb ? parseInt(entry.ProviderIds.Tmdb, 10) : null;
        if (!tmdbId) return;
        if (entry.Type === "Movie") addSeed("movie", tmdbId, 4, "jellyfin", entry.Name);
        if (entry.Type === "Series") addSeed("tv", tmdbId, 4, "jellyfin", entry.Name);
      });
    }

    const seeds = Array.from(seedMap.values())
      .sort((a, b) => b.weight - a.weight)
      .slice(0, SEED_LIMIT);

    const candidateMap = new Map<string, Candidate>();
    const addCandidate = (mediaType: MediaType, tmdbId: number, score: number, seedSource?: string, seedId?: number, seedRating?: number) => {
      const key = keyFor(mediaType, tmdbId);
      if (excluded.has(key)) return;
      const existing = candidateMap.get(key);
      if (!existing) {
        candidateMap.set(key, { tmdbId, mediaType, score, seedSource, seedId, seedRating });
      } else {
        existing.score += score;
      }
    };

    const seedResults = await Promise.all(
      seeds.map(async (seed) => {
        const recs = await fetchSeedRecommendations(seed);
        return { seed, recs };
      })
    );

    seedResults.forEach(({ seed, recs }) => {
      recs.forEach((tmdbId, index) => {
        const score = seed.weight * 100 - index * 2;
        addCandidate(seed.mediaType, tmdbId, score, seed.source, seed.tmdbId);
      });
    });

    let candidates = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);

    if (candidates.length < totalNeeded) {
      const [trending, popularMovies, popularTv] = await Promise.all([
        getTrendingAll().catch(() => null),
        getPopularMovies().catch(() => null),
        getPopularTv().catch(() => null)
      ]);

      const fallback: Array<{ tmdbId: number; mediaType: MediaType }> = [];
      (trending?.results ?? []).forEach((item: any) => {
        if (item?.media_type === "movie" || item?.media_type === "tv") {
          fallback.push({ tmdbId: item.id, mediaType: item.media_type });
        }
      });
      (popularMovies?.results ?? []).forEach((item: any) => fallback.push({ tmdbId: item.id, mediaType: "movie" }));
      (popularTv?.results ?? []).forEach((item: any) => fallback.push({ tmdbId: item.id, mediaType: "tv" }));

      // Filter fallback by mediaType if specified
      if (mediaTypeParam) {
        fallback.forEach((item, index) => {
          if (item.mediaType === mediaTypeParam && candidates.length < totalNeeded) {
            addCandidate(item.mediaType, item.tmdbId, 10 - index * 0.1);
          }
        });
      } else {
        fallback.forEach((item, index) => {
          if (candidates.length >= totalNeeded) return;
          addCandidate(item.mediaType, item.tmdbId, 10 - index * 0.1);
        });
      }

      candidates = Array.from(candidateMap.values()).sort((a, b) => b.score - a.score);
    }

    const needed = limit + 1;
    const items: any[] = [];

    for (let i = offset; i < candidates.length && items.length < needed; i++) {
      const item = candidates[i];
      try {
        if (item.mediaType === "movie") {
          const movie = await getMovie(item.tmdbId);
          if (!movie) continue;
          let explanation = "Based on your activity";
          if (item.seedSource === "favorite") {
            const seedTitle = seedTitles.get(keyFor("movie", item.seedId!));
            explanation = `Similar to "${seedTitle?.title ?? "saved item"}"`;
          } else if (item.seedSource === "review") {
            const rating = item.seedRating ? Math.round(item.seedRating / 2) : 3;
            explanation = `Similar to your ${rating}⭐ pick`;
          } else if (item.seedSource === "watchlist") {
            const seedTitle = seedTitles.get(keyFor("movie", item.seedId!));
            explanation = `Similar to "${seedTitle?.title ?? "watchlist item"}"`;
          } else if (item.seedSource === "jellyfin") {
            explanation = "Based on your watch history";
          }
          const res: any = {
            id: item.tmdbId,
            title: movie.title ?? "Untitled",
            posterUrl: tmdbImageUrl(movie.poster_path, "w500", imageProxyEnabled),
            year: (movie.release_date ?? "").slice(0, 4),
            rating: movie.vote_average ?? 0,
            description: movie.overview ?? "",
            type: "movie",
            genres: movie.genres?.map((g: any) => g.id) ?? [],
            popularity: movie.popularity || 0,
            explanation
          };
          if (selectedGenres.length > 0 && !selectedGenres.some(g => res.genres.includes(g))) continue;
          if (searchParam && !res.title.toLowerCase().includes(searchParam.toLowerCase())) continue;
          if (mediaTypeParam && res.type !== mediaTypeParam) continue;
          items.push(res);
        } else {
          const tv = await getTv(item.tmdbId);
          if (!tv) continue;
          let explanation = "Based on your activity";
          if (item.seedSource === "favorite") {
            const seedTitle = seedTitles.get(keyFor("tv", item.seedId!));
            explanation = `Similar to "${seedTitle?.title ?? "saved item"}"`;
          } else if (item.seedSource === "review") {
            const rating = item.seedRating ? Math.round(item.seedRating / 2) : 3;
            explanation = `Similar to your ${rating}⭐ pick`;
          } else if (item.seedSource === "watchlist") {
            const seedTitle = seedTitles.get(keyFor("tv", item.seedId!));
            explanation = `Similar to "${seedTitle?.title ?? "watchlist item"}"`;
          } else if (item.seedSource === "jellyfin") {
            explanation = "Based on your watch history";
          }
          const res: any = {
            id: item.tmdbId,
            title: tv.name ?? "Untitled",
            posterUrl: tmdbImageUrl(tv.poster_path, "w500", imageProxyEnabled),
            year: (tv.first_air_date ?? "").slice(0, 4),
            rating: tv.vote_average ?? 0,
            description: tv.overview ?? "",
            type: "tv",
            genres: tv.genres?.map((g: any) => g.id) ?? [],
            popularity: tv.popularity || 0,
            explanation
          };
          if (selectedGenres.length > 0 && !selectedGenres.some(g => res.genres.includes(g))) continue;
          if (searchParam && !res.title.toLowerCase().includes(searchParam.toLowerCase())) continue;
          if (mediaTypeParam && res.type !== mediaTypeParam) continue;
          items.push(res);
        }
      } catch {
      }
    }

    let sorted = items;
    if (sortParam === "year") {
      sorted.sort((a, b) => parseInt(b.year) - parseInt(a.year));
    } else if (sortParam === "popularity") {
      sorted.sort((a, b) => b.popularity - a.popularity);
    } else {
      sorted.sort((a, b) => b.rating - a.rating);
    }
    const finalHasMore = sorted.length > limit;
    return cacheableJsonResponseWithETag(req, { items: sorted.slice(0, limit), hasMore: finalHasMore }, { maxAge: 120, sMaxAge: 0, private: true });
  } catch (err) {
    return jsonResponseWithETag(req, { items: [], error: "Unable to load recommendations" }, { status: 500 });
  }
}
