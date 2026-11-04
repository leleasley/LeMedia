import type { FastifyInstance } from 'fastify';
import {
  searchMulti,
  discoverByGenre,
  discoverMixed,
  getTmdbApi,
  getWatchProviders,
  getPersonDetails,
  getMovieCollection,
} from '../../services/tmdb.js';
import { fetchList } from './helpers.js';

/**
 * Search + discover endpoints. Search goes through TMDB's multi-search; discover is either
 * filtered-by-genre (with optional vote/date/country/keyword modifiers) or a flat passthrough
 * for the homepage query builder (strict param whitelist to prevent property injection).
 */
const SEARCH_MERGED_PAGES = 3;
const SEARCH_MERGED_CAP = 40;
/** How many of a person's credits to inline when the query is their name. TMDB's
 *  `known_for` only carries ~8 titles; the full filmography is what people actually want. */
const PERSON_CREDITS_CAP = 30;

type SearchResultLite = { id: number; media_type?: string; [k: string]: unknown };

type SearchPersonLite = SearchResultLite & { name?: string; known_for?: SearchResultLite[] };

/** First N TMDB search pages merged, requestable types only, deduped, capped. Each page
 *  is cached individually by `searchMulti` (1h), so repeat queries cost no extra TMDB calls. */
/** Max people returned next to merged search results. */
const PEOPLE_CAP = 8;
/** TMDB popularity floor for surfacing a person (obscure name matches sit well below 1). */
const PEOPLE_MIN_POPULARITY = 1.5;

async function searchMultiMerged(query: string, lang: string) {
  const pages = await Promise.all(
    Array.from({ length: SEARCH_MERGED_PAGES }, (_, i) => searchMulti(query, i + 1, lang)),
  );
  const seen = new Set<string>();
  const results: SearchResultLite[] = [];
  // Matched people, surfaced separately so the UI can offer "People" alongside the titles
  // (their credits are still inlined into `results` below).
  const people: { id: number; name: string; profile_path: string | null; known_for_department: string | null }[] = [];
  const push = (r: SearchResultLite) => {
    if (r.media_type !== 'movie' && r.media_type !== 'tv') return;
    if (typeof r.id !== 'number') return;
    const key = `${r.media_type}:${r.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(r);
  };

  // Person hits are expanded to their filmography. `known_for` (≈8 titles) ships inside the
  // multi-search response, but the full credit list needs the person's detail payload — one
  // extra TMDB call, cached for 24h by getPersonDetails, so repeat searches are free.
  const personCredits = new Map<number, Promise<SearchResultLite[]>>();
  const creditsFor = (personId: number): Promise<SearchResultLite[]> => {
    let pending = personCredits.get(personId);
    if (!pending) {
      pending = getPersonDetails(personId, lang)
        .then((person) => {
          const cast = person.combined_credits?.cast ?? [];
          return cast
            .filter((c) => c.media_type === 'movie' || c.media_type === 'tv')
            .slice(0, PERSON_CREDITS_CAP)
            .map((c) => ({ ...c } as SearchResultLite));
        })
        .catch(() => [] as SearchResultLite[]);
      personCredits.set(personId, pending);
    }
    return pending;
  };

  // Kick off every person's filmography lookup up front, in parallel — awaiting them one by
  // one inside the loop below made name searches wait on several sequential TMDB calls.
  for (const pageData of pages) {
    for (const r of ((pageData.results ?? []) as SearchPersonLite[])) {
      if (r.media_type === 'person' && Array.isArray(r.known_for) && typeof r.id === 'number') void creditsFor(r.id);
    }
  }

  for (const pageData of pages) {
    for (const r of ((pageData.results ?? []) as SearchPersonLite[])) {
      const pr = r as SearchPersonLite & { profile_path?: string | null; known_for_department?: string | null; popularity?: number };
      // Only notable people: TMDB name matches are noisy ("dune" → dozens of uncredited
      // crew), so require a photo and a minimum popularity before surfacing someone.
      if (r.media_type === 'person' && typeof r.id === 'number' && people.length < PEOPLE_CAP
        && !!pr.profile_path && (pr.popularity ?? 0) >= PEOPLE_MIN_POPULARITY && !people.some((p) => p.id === r.id)) {
        people.push({ id: r.id, name: r.name ?? '', profile_path: pr.profile_path ?? null, known_for_department: pr.known_for_department ?? null });
      }
      if (r.media_type === 'person' && Array.isArray(r.known_for)) {
        // Name match (actor/director/crew): inline their credits at this relevance position
        // so a name search yields requestable films instead of an empty grid.
        for (const k of r.known_for) push({ ...k, via_person: r.name ?? null });
        // …then their fuller filmography, minus anything already in the grid.
        const credits = await creditsFor(r.id);
        for (const c of credits) {
          if (c.media_type !== 'movie' && c.media_type !== 'tv') continue;
          const key = `${c.media_type}:${c.id}`;
          if (seen.has(key)) continue;
          push({ ...c, via_person: r.name ?? null });
          if (results.length >= SEARCH_MERGED_CAP) break;
        }
      } else {
        push(r);
      }
      if (results.length >= SEARCH_MERGED_CAP) break;
    }
    if (results.length >= SEARCH_MERGED_CAP) break;
  }
  await attachCollections(results, lang);
  // Delivered as one bundle — totals describe the bundle, not TMDB's global counts.
  return { results, people, total_results: results.length, total_pages: 1, page: 1 };
}

/** How many top movies to look up a franchise for. TMDB's search payload carries no
 *  collection information, so the grid has to ask separately; these run in parallel and are
 *  cached for a week, so a repeat search costs nothing. */
const COLLECTION_LOOKUP_CAP = 10;

/** Attach `belongs_to_collection` to the leading movies so the UI can group a franchise
 *  search into one row per collection. Non-fatal: a failure just means no grouping. */
async function attachCollections(results: SearchResultLite[], lang: string): Promise<void> {
  const movies = results
    .filter((r) => r.media_type === 'movie' && typeof r.id === 'number')
    .slice(0, COLLECTION_LOOKUP_CAP);
  if (movies.length === 0) return;
  const collections = await Promise.all(
    movies.map((m) => getMovieCollection(m.id, lang).catch(() => null)),
  );
  movies.forEach((m, i) => {
    const coll = collections[i];
    if (coll) m.belongs_to_collection = coll;
  });
}

export async function discoverRoutes(app: FastifyInstance) {
  app.get('/search', {
    schema: {
      querystring: {
        type: 'object' as const,
        required: ['q'],
        properties: {
          q: { type: 'string', description: 'Search query string' },
          page: { type: 'string', description: 'Page number for pagination (defaults to 1)' },
        },
      },
    },
  }, async (request) => {
    const { q, page: pageParam } = request.query as { q: string; page?: string };
    if (!q || q.trim().length === 0) {
      return { results: [], total_pages: 0, total_results: 0, nsfwTmdbIds: [] as number[] };
    }
    return fetchList(request, ({ page, lang }) => {
      // Explicit page>1 callers keep single-page passthrough. Page 1 aggregates the
      // first 3 TMDB pages, keeps requestable types plus person known_for credits, so a
      // name search yields films — and total_results reflects what's actually rendered
      // instead of TMDB's all-types, all-pages count.
      if (page > 1 || Number.parseInt(pageParam ?? '1', 10) > 1) {
        return searchMulti(q.trim(), page, lang);
      }
      return searchMultiMerged(q.trim(), lang);
    }, 'movie');
  });

  app.get('/discover/:mediaType/genre/:genreId', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['mediaType', 'genreId'],
        properties: {
          mediaType: { type: 'string', enum: ['movie', 'tv', 'all'], description: 'Type of media to discover' },
          genreId: { type: 'string', description: 'TMDB genre ID' },
        },
      },
      querystring: {
        type: 'object' as const,
        properties: {
          page: { type: 'string' },
          sortBy: { type: 'string' },
          voteAverageGte: { type: 'string' },
          releaseDateGte: { type: 'string' },
          releaseDateLte: { type: 'string' },
          originCountry: { type: 'string' },
          keyword: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { mediaType, genreId } = request.params as { mediaType: string; genreId: string };
    const { sortBy, voteAverageGte, releaseDateGte, releaseDateLte, originCountry, keyword } = request.query as {
      sortBy?: string; voteAverageGte?: string; releaseDateGte?: string; releaseDateLte?: string; originCountry?: string; keyword?: string;
    };
    if (mediaType !== 'movie' && mediaType !== 'tv' && mediaType !== 'all') {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }
    const gid = Number.parseInt(genreId, 10);
    if (Number.isNaN(gid) || gid < 0) return reply.status(400).send({ error: 'Invalid genreId' });

    const filters = {
      sortBy,
      voteAverageGte: voteAverageGte ? Number.parseFloat(voteAverageGte) : undefined,
      releaseDateGte,
      releaseDateLte,
      originCountry,
      keyword: keyword ? Number.parseInt(keyword) : undefined,
    };
    return fetchList(
      request,
      ({ page, lang }) => mediaType === 'all'
        ? discoverMixed(page, lang, filters)
        : discoverByGenre(mediaType, gid, page, lang, filters),
      'movie',
    );
  });

  // Watch-provider list for the homepage query builder (logos + ids, cached a week).
  app.get('/watch/providers/:mediaType', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['mediaType'],
        properties: {
          mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'movie or tv' },
        },
      },
      querystring: {
        type: 'object' as const,
        properties: {
          region: { type: 'string', description: 'ISO country (default GB)' },
        },
      },
    },
  }, async (request) => {
    const { mediaType } = request.params as { mediaType: string };
    const { region } = request.query as { region?: string };
    const clean = (region || 'GB').toUpperCase().slice(0, 2);
    return getWatchProviders(mediaType as 'movie' | 'tv', /^[A-Z]{2}$/.test(clean) ? clean : 'GB');
  });

  // Flat discover passthrough used by the homepage query builder. No querystring schema —
  // TMDB's discover API takes many params (sort_by, with_genres, vote_average.gte…) and the
  // real gate is the ALLOWED_PARAMS whitelist below; declaring only `page` would mislead
  // readers into thinking other keys are rejected.
  app.get('/discover/:mediaType', {
    schema: {
      params: {
        type: 'object' as const,
        required: ['mediaType'],
        properties: {
          mediaType: { type: 'string', enum: ['movie', 'tv'], description: 'movie or tv' },
        },
      },
    },
  }, async (request, reply) => {
    const { mediaType } = request.params as { mediaType: string };
    if (mediaType !== 'movie' && mediaType !== 'tv') {
      return reply.status(400).send({ error: 'Invalid mediaType' });
    }
    const query = request.query as Record<string, string>;
    // Whitelist allowed TMDB discover params to prevent property injection.
    const ALLOWED_PARAMS = new Set([
      'page', 'sort_by', 'with_genres', 'with_keywords', 'with_original_language',
      'with_watch_providers', 'watch_region',
      'primary_release_date.gte', 'primary_release_date.lte',
      'first_air_date.gte', 'first_air_date.lte',
      'vote_average.gte', 'vote_count.gte', 'region', 'language',
      'include_adult', 'include_video', 'year', 'first_air_date_year',
    ]);
    const params: Record<string, string> = {};
    for (const [key, value] of Object.entries(query)) {
      if (value && ALLOWED_PARAMS.has(key)) params[key] = value;
    }
    if (!params.page) params.page = '1';

    // Static path — mediaType already validated, ternary satisfies CodeQL taint analysis.
    const discoverPath = mediaType === 'movie' ? '/discover/movie' : '/discover/tv';

    return fetchList(request, async () => {
      const tmdb = getTmdbApi();
      const { data } = await tmdb.get(discoverPath, { params });
      return data;
    }, mediaType);
  });
}
