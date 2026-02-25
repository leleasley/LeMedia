import "server-only";

import { MediaCarousel } from "@/components/Media/MediaCarousel";
import { DashboardSliderType } from "@/lib/dashboard-sliders";
import { discoverMovies, discoverTv, searchMulti, tmdbImageUrl } from "@/lib/tmdb";

type Props = {
  slider: { type: number; title: string | null; data: string | null };
  imageProxyEnabled: boolean;
};

type MediaCard = {
  id: number;
  title: string;
  year: string;
  rating: number;
  poster: string | null;
  overview?: string;
  type: "movie" | "tv";
};

function toCards(list: any[], type: "movie" | "tv", useProxy: boolean): MediaCard[] {
  return (list ?? []).filter((item: any) => item && item.id).slice(0, 20).map((item: any) => ({
    id: item.id,
    title: type === "movie" ? item.title ?? "Untitled" : item.name ?? "Untitled",
    year:
      type === "movie"
        ? (item.release_date ?? "").slice(0, 4)
        : (item.first_air_date ?? "").slice(0, 4),
    rating: item.vote_average ?? 0,
    poster: tmdbImageUrl(item.poster_path, "w500", useProxy),
    overview: item.overview,
    type,
  }));
}

export default async function DashboardTmdbCustomCarousel({ slider, imageProxyEnabled }: Props) {
  const title = slider.title?.trim() || "Custom Slider";
  const data = slider.data?.trim() || "";
  if (!data) return null;

  const safe = async <T extends { results?: any[] }>(fn: () => Promise<T>): Promise<any[]> => {
    try {
      const res = await fn();
      return res?.results ?? [];
    } catch {
      return [];
    }
  };

  let items: MediaCard[] = [];

  switch (Number(slider.type)) {
    case DashboardSliderType.TMDB_MOVIE_GENRE: {
      const genreId = Number(data);
      if (Number.isFinite(genreId) && genreId > 0) {
        const results = await safe(() => discoverMovies({ with_genres: genreId, sort_by: "popularity.desc" }, 1));
        items = toCards(results, "movie", imageProxyEnabled);
      }
      break;
    }
    case DashboardSliderType.TMDB_TV_GENRE: {
      const genreId = Number(data);
      if (Number.isFinite(genreId) && genreId > 0) {
        const results = await safe(() => discoverTv({ with_genres: genreId, sort_by: "popularity.desc" }, 1));
        items = toCards(results, "tv", imageProxyEnabled);
      }
      break;
    }
    case DashboardSliderType.TMDB_MOVIE_KEYWORD: {
      const keywords = data
        .split(",")
        .map(s => Number(s.trim()))
        .filter(n => Number.isFinite(n) && n > 0);
      if (keywords.length) {
        const results = await safe(() => discoverMovies({ with_keywords: keywords.join(","), sort_by: "popularity.desc" }, 1));
        items = toCards(results, "movie", imageProxyEnabled);
      }
      break;
    }
    case DashboardSliderType.TMDB_TV_KEYWORD: {
      const keywords = data
        .split(",")
        .map(s => Number(s.trim()))
        .filter(n => Number.isFinite(n) && n > 0);
      if (keywords.length) {
        const results = await safe(() => discoverTv({ with_keywords: keywords.join(","), sort_by: "popularity.desc" }, 1));
        items = toCards(results, "tv", imageProxyEnabled);
      }
      break;
    }
    case DashboardSliderType.TMDB_STUDIO: {
      const studioId = Number(data);
      if (Number.isFinite(studioId) && studioId > 0) {
        const results = await safe(() => discoverMovies({ with_companies: studioId, sort_by: "popularity.desc" }, 1));
        items = toCards(results, "movie", imageProxyEnabled);
      }
      break;
    }
    case DashboardSliderType.TMDB_NETWORK: {
      const networkId = Number(data);
      if (Number.isFinite(networkId) && networkId > 0) {
        const results = await safe(() => discoverTv({ with_networks: networkId, sort_by: "popularity.desc" }, 1));
        items = toCards(results, "tv", imageProxyEnabled);
      }
      break;
    }
    case DashboardSliderType.TMDB_SEARCH: {
      const query = data;
      const results = await safe(() => searchMulti(query, 1));
      const filtered = results
        .filter((r: any) => (r?.media_type === "movie" || r?.media_type === "tv") && r.id)
        .slice(0, 20)
        .map((r: any) => ({
          id: r.id,
          title: r.media_type === "movie" ? r.title ?? "Untitled" : r.name ?? "Untitled",
          year:
            r.media_type === "movie"
              ? (r.release_date ?? "").slice(0, 4)
              : (r.first_air_date ?? "").slice(0, 4),
          rating: r.vote_average ?? 0,
          poster: tmdbImageUrl(r.poster_path, "w500", imageProxyEnabled),
          overview: r.overview,
          type: r.media_type as "movie" | "tv",
        }));
      items = filtered;
      break;
    }
  }

  if (!items.length) return null;

  return (
    <MediaCarousel
      title={title}
      lazy
      cardMode="requestable"
      items={items.map(m => ({
        id: m.id,
        title: m.title,
        posterUrl: m.poster,
        year: m.year,
        rating: m.rating,
        description: m.overview,
        type: m.type,
      }))}
    />
  );
}

