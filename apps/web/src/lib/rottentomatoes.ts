import 'server-only';
import { getCached, setCached } from '@/lib/local-cache';
import { deduplicateFetch } from '@/lib/request-cache';
import { logger } from '@/lib/logger';

interface RTAlgoliaSearchResponse {
    results: {
        hits: RTAlgoliaHit[];
        index: 'content_rt' | 'people_rt';
    }[];
}

interface RTAlgoliaHit {
    emsId: string;
    emsVersionId: string;
    tmsId: string;
    type: string;
    title: string;
    titles?: string[];
    description: string;
    releaseYear: number;
    rating: string;
    genres: string[];
    updateDate: string;
    isEmsSearchable: boolean;
    rtId: number;
    vanity: string;
    aka?: string[];
    posterImageUrl: string;
    rottenTomatoes?: {
        audienceScore: number;
        criticsIconUrl: string;
        wantToSeeCount: number;
        audienceIconUrl: string;
        scoreSentiment: string;
        certifiedFresh: boolean;
        criticsScore: number;
    };
}

export interface RTRating {
    title: string;
    year: number;
    criticsRating: 'Certified Fresh' | 'Fresh' | 'Rotten';
    criticsScore: number;
    audienceRating?: 'Upright' | 'Spilled';
    audienceScore?: number;
    url: string;
}

// Tunables
const INEXACT_TITLE_FACTOR = 0.25;
const ALTERNATE_TITLE_FACTOR = 0.8;
const PER_YEAR_PENALTY = 0.4;
const MINIMUM_SCORE = 0.175;

// Jaro-Winkler distance implementation (simplified)
function jaroWinkler(s1: string, s2: string): number {
    const m1 = s1.length;
    const m2 = s2.length;

    if (m1 === 0 && m2 === 0) return 1;
    if (m1 === 0 || m2 === 0) return 0;

    const matchWindow = Math.floor(Math.max(m1, m2) / 2) - 1;
    const s1Matches = new Array(m1).fill(false);
    const s2Matches = new Array(m2).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < m1; i++) {
        const start = Math.max(0, i - matchWindow);
        const end = Math.min(i + matchWindow + 1, m2);

        for (let j = start; j < end; j++) {
            if (s2Matches[j] || s1[i] !== s2[j]) continue;
            s1Matches[i] = s2Matches[j] = true;
            matches++;
            break;
        }
    }

    if (matches === 0) return 0;

    let k = 0;
    for (let i = 0; i < m1; i++) {
        if (!s1Matches[i]) continue;
        while (!s2Matches[k]) k++;
        if (s1[i] !== s2[k]) transpositions++;
        k++;
    }

    const jaro = (matches / m1 + matches / m2 + (matches - transpositions / 2) / matches) / 3;

    // Winkler modification
    let prefix = 0;
    for (let i = 0; i < Math.min(m1, m2, 4); i++) {
        if (s1[i] === s2[i]) prefix++;
        else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
}

// Normalization for title comparisons.
// Lowercase and strip non-alphanumeric (unicode-aware).
const norm = (s: string): string =>
    s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '');

// Title similarity. 1 if exact, quarter-jaro otherwise.
const similarity = (a: string, b: string): number =>
    a === b ? 1 : jaroWinkler(a, b) * INEXACT_TITLE_FACTOR;

// Gets the best similarity score between the searched title and all alternate
// titles of the search result. Non-main titles are penalized.
const t_score = ({ title, titles, aka }: RTAlgoliaHit, s: string): number => {
    const f = (t: string, i: number) =>
        similarity(norm(t), norm(s)) * (i ? ALTERNATE_TITLE_FACTOR : 1);
    return Math.max(...[title].concat(aka || [], titles || []).map(f));
};

// Year difference to score: 0 -> 1.0, 1 -> 0.6, 2 -> 0.2, 3+ -> 0.0
const y_score = (r: RTAlgoliaHit, y?: number): number =>
    y ? Math.max(0, 1 - Math.abs(r.releaseYear - y) * PER_YEAR_PENALTY) : 1;

// Cut score in half if result has no ratings.
const extra_score = (r: RTAlgoliaHit): number => (r.rottenTomatoes ? 1 : 0.5);

// Score search result as product of all subscores
const score = (r: RTAlgoliaHit, name: string, year?: number): number =>
    t_score(r, name) * y_score(r, year) * extra_score(r);

// Score each search result and return the highest scoring result, if any
const best = (rs: RTAlgoliaHit[], name: string, year?: number): RTAlgoliaHit | undefined =>
    rs
        .map((r) => ({ score: score(r, name, year), result: r }))
        .filter(({ score }) => score > MINIMUM_SCORE)
        .sort(({ score: a }, { score: b }) => b - a)[0]?.result;

/**
 * Search the RT algolia api for the movie title
 *
 * @param name Movie name
 * @param year Release Year
 */
export async function getMovieRatings(
    name: string,
    year: number
): Promise<RTRating | null> {
    try {
        const cacheKey = `rt:movie:${name.toLowerCase()}:${year}`;

        // Use deduplication to prevent concurrent duplicate requests
        return deduplicateFetch(
            cacheKey,
            async () => {
                const cached = getCached<RTRating | null>(cacheKey);
                if (cached !== undefined) return cached;

                const filters = encodeURIComponent('isEmsSearchable=1 AND type:"movie"');
                const response = await fetch(
                    'https://79frdp12pn-dsn.algolia.net/1/indexes/*/queries',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json',
                            'x-algolia-agent':
                                'Algolia%20for%20JavaScript%20(4.14.3)%3B%20Browser%20(lite)',
                            'x-algolia-api-key': process.env.ALGOLIA_API_KEY || '',
                            'x-algolia-application-id': process.env.ALGOLIA_APPLICATION_ID || '',
                        },
                        body: JSON.stringify({
                            requests: [
                                {
                                    indexName: 'content_rt',
                                    query: name.replace(/\bthe\b ?/gi, ''),
                                    params: `filters=${filters}&hitsPerPage=20`,
                                },
                            ],
                        }),
                        next: { revalidate: 86400 }, // 24 hours
                    }
                );

                if (!response.ok) {
                    return null;
                }

                const data = (await response.json()) as RTAlgoliaSearchResponse;
                const contentResults = data.results.find((r) => r.index === 'content_rt');
                const movie = best(contentResults?.hits || [], name, year);

                if (!movie?.rottenTomatoes) {
                    setCached(cacheKey, null, 6 * 60 * 60 * 1000);
                    return null;
                }

                const rating: RTRating = {
                    title: movie.title,
                    url: `https://www.rottentomatoes.com/m/${movie.vanity}`,
                    criticsRating: movie.rottenTomatoes.certifiedFresh
                        ? 'Certified Fresh'
                        : movie.rottenTomatoes.criticsScore >= 60
                            ? 'Fresh'
                            : 'Rotten',
                    criticsScore: movie.rottenTomatoes.criticsScore,
                    audienceRating:
                        movie.rottenTomatoes.audienceScore >= 60 ? 'Upright' : 'Spilled',
                    audienceScore: movie.rottenTomatoes.audienceScore,
                    year: Number(movie.releaseYear),
                };
                setCached(cacheKey, rating, 6 * 60 * 60 * 1000);
                return rating;
            },
            { ttl: 6 * 60 * 60 * 1000 } // 6 hours
        );
    } catch (e) {
        logger.error('[RT API] Failed to retrieve movie ratings', e);
        return null;
    }
}

/**
 * Search the RT algolia api for the TV show
 *
 * @param name TV show name
 * @param year Release Year
 */
export async function getTVRatings(
    name: string,
    year?: number
): Promise<RTRating | null> {
    try {
        const cacheKey = `rt:tv:${name.toLowerCase()}:${year ?? "unknown"}`;

        // Use deduplication to prevent concurrent duplicate requests
        return deduplicateFetch(
            cacheKey,
            async () => {
                const cached = getCached<RTRating | null>(cacheKey);
                if (cached !== undefined) return cached;

                const filters = encodeURIComponent('isEmsSearchable=1 AND type:"tv"');
                const response = await fetch(
                    'https://79frdp12pn-dsn.algolia.net/1/indexes/*/queries',
                    {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json',
                            'x-algolia-agent':
                                'Algolia%20for%20JavaScript%20(4.14.3)%3B%20Browser%20(lite)',
                            'x-algolia-api-key': process.env.ALGOLIA_API_KEY || '',
                            'x-algolia-application-id': process.env.ALGOLIA_APPLICATION_ID || '',
                        },
                        body: JSON.stringify({
                            requests: [
                                {
                                    indexName: 'content_rt',
                                    query: name,
                                    params: `filters=${filters}&hitsPerPage=20`,
                                },
                            ],
                        }),
                        next: { revalidate: 86400 }, // 24 hours
                    }
                );

                if (!response.ok) {
                    return null;
                }

                const data = (await response.json()) as RTAlgoliaSearchResponse;
                const contentResults = data.results.find((r) => r.index === 'content_rt');
                const tvshow = best(contentResults?.hits || [], name, year);

                if (!tvshow?.rottenTomatoes) {
                    setCached(cacheKey, null, 6 * 60 * 60 * 1000);
                    return null;
                }

                const rating: RTRating = {
                    title: tvshow.title,
                    url: `https://www.rottentomatoes.com/tv/${tvshow.vanity}`,
                    criticsRating: tvshow.rottenTomatoes.criticsScore >= 60 ? 'Fresh' : 'Rotten',
                    criticsScore: tvshow.rottenTomatoes.criticsScore,
                    audienceRating: tvshow.rottenTomatoes.audienceScore >= 60 ? 'Upright' : 'Spilled',
                    audienceScore: tvshow.rottenTomatoes.audienceScore,
                    year: Number(tvshow.releaseYear),
                };
                setCached(cacheKey, rating, 6 * 60 * 60 * 1000);
                return rating;
            },
            { ttl: 6 * 60 * 60 * 1000 } // 6 hours
        );
    } catch (e) {
        logger.error('[RT API] Failed to retrieve TV ratings', e);
        return null;
    }
}
