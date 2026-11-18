import type { TmdbMedia } from '@/types';

export function dbMediaToTmdbShape(m: {
  tmdbId: number;
  mediaType: string;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate?: string | null;
  voteAverage?: number | null;
  lastEpisodeInfo?: { season: number; episode: number; title: string } | null;
}): TmdbMedia {
  return {
    id: m.tmdbId > 0 ? m.tmdbId : 0,
    title: m.mediaType === 'movie' ? m.title : undefined,
    name: m.mediaType === 'tv' ? m.title : undefined,
    poster_path: m.posterPath,
    backdrop_path: m.backdropPath,
    release_date: m.mediaType === 'movie' ? (m.releaseDate ?? undefined) : undefined,
    first_air_date: m.mediaType === 'tv' ? (m.releaseDate ?? undefined) : undefined,
    vote_average: m.voteAverage ?? 0,
    vote_count: 0,
    overview: '',
    media_type: m.mediaType,
    lastEpisodeInfo: m.lastEpisodeInfo,
  };
}

/** A row from /media/missing (services/missing.ts). Keys are camelCase there, while the card
 *  components consume TMDB's snake_case shape — this is the single place that bridges them, so
 *  the homepage row and the Missing page can never drift apart again. */
export interface MissingApiRow {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: string | null;
  year: number | null;
  runtime: number | null;
  rating: number | null;
  certification: string | null;
  missingEpisodes?: number;
  totalEpisodes?: number;
}

export function missingRowToTmdbShape(row: MissingApiRow): TmdbMedia {
  return {
    id: row.id,
    media_type: row.mediaType,
    title: row.mediaType === 'movie' ? row.title : undefined,
    name: row.mediaType === 'tv' ? row.title : undefined,
    poster_path: row.posterPath,
    backdrop_path: row.backdropPath,
    release_date: row.mediaType === 'movie' ? (row.releaseDate ?? undefined) : undefined,
    first_air_date: row.mediaType === 'tv' ? (row.releaseDate ?? undefined) : undefined,
    vote_average: row.rating ?? 0,
  } as TmdbMedia;
}

/** Map the { results } envelope (or a plain array) coming back from /media/missing. */
export function missingResponseToCards(data: unknown): TmdbMedia[] {
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { results?: unknown }).results)
      ? ((data as { results: unknown[] }).results)
      : [];
  return rows
    .filter((row): row is MissingApiRow => !!row && typeof row === 'object' && 'posterPath' in (row as object))
    .map(missingRowToTmdbShape);
}
