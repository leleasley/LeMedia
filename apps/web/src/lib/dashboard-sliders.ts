export enum DashboardSliderType {
  RECENTLY_ADDED = 1,
  FAVORITES = 2,
  WATCHLIST = 3,
  RECENT_REQUESTS = 4,
  CONTINUE_WATCHING = 5,
  TRENDING = 6,
  POPULAR_MOVIES = 7,
  MOVIE_GENRES = 8,
  UPCOMING_MOVIES = 9,
  POPULAR_TV = 10,
  TV_GENRES = 11,
  UPCOMING_TV = 12,
  TOP_RATED_MOVIES = 13,
  TOP_RATED_TV = 14,
  NETWORKS = 15,
  RECENTLY_VIEWED = 16,

  TMDB_MOVIE_KEYWORD = 100,
  TMDB_TV_KEYWORD = 101,
  TMDB_MOVIE_GENRE = 102,
  TMDB_TV_GENRE = 103,
  TMDB_SEARCH = 104,
  TMDB_STUDIO = 105,
  TMDB_NETWORK = 106,
}

export type DashboardSlider = {
  id: number;
  type: DashboardSliderType | number;
  title: string | null;
  data: string | null;
  enabled: boolean;
  order: number;
  isBuiltIn: boolean;
};

export const dashboardSliderTitles: Record<number, string> = {
  [DashboardSliderType.RECENTLY_ADDED]: "Recently Added",
  [DashboardSliderType.FAVORITES]: "Favorites",
  [DashboardSliderType.WATCHLIST]: "Watchlist",
  [DashboardSliderType.RECENT_REQUESTS]: "Recent Requests",
  [DashboardSliderType.CONTINUE_WATCHING]: "Continue Watching",
  [DashboardSliderType.TRENDING]: "Trending",
  [DashboardSliderType.POPULAR_MOVIES]: "Popular Movies",
  [DashboardSliderType.MOVIE_GENRES]: "Movie Genres",
  [DashboardSliderType.UPCOMING_MOVIES]: "Upcoming Movies",
  [DashboardSliderType.POPULAR_TV]: "Popular TV Shows",
  [DashboardSliderType.TV_GENRES]: "TV Genres",
  [DashboardSliderType.UPCOMING_TV]: "Upcoming TV Shows",
  [DashboardSliderType.TOP_RATED_MOVIES]: "Top Rated Movies",
  [DashboardSliderType.TOP_RATED_TV]: "Top Rated TV Shows",
  [DashboardSliderType.NETWORKS]: "Networks",
  [DashboardSliderType.RECENTLY_VIEWED]: "Recently Viewed",
  [DashboardSliderType.TMDB_MOVIE_KEYWORD]: "TMDB Movie Keyword",
  [DashboardSliderType.TMDB_TV_KEYWORD]: "TMDB TV Keyword",
  [DashboardSliderType.TMDB_MOVIE_GENRE]: "TMDB Movie Genre",
  [DashboardSliderType.TMDB_TV_GENRE]: "TMDB TV Genre",
  [DashboardSliderType.TMDB_SEARCH]: "TMDB Search",
  [DashboardSliderType.TMDB_STUDIO]: "TMDB Studio",
  [DashboardSliderType.TMDB_NETWORK]: "TMDB Network",
};

export const defaultDashboardSliders: Array<
  Pick<DashboardSlider, "type" | "enabled" | "isBuiltIn" | "order"> & Partial<Pick<DashboardSlider, "title" | "data">>
> = [
  { type: DashboardSliderType.RECENTLY_ADDED, enabled: true, isBuiltIn: true, order: 0 },
  { type: DashboardSliderType.FAVORITES, enabled: true, isBuiltIn: true, order: 1 },
  { type: DashboardSliderType.WATCHLIST, enabled: true, isBuiltIn: true, order: 2 },
  { type: DashboardSliderType.RECENT_REQUESTS, enabled: true, isBuiltIn: true, order: 3 },
  { type: DashboardSliderType.CONTINUE_WATCHING, enabled: true, isBuiltIn: true, order: 4 },
  { type: DashboardSliderType.RECENTLY_VIEWED, enabled: false, isBuiltIn: true, order: 5 },
  { type: DashboardSliderType.TRENDING, enabled: true, isBuiltIn: true, order: 6 },
  { type: DashboardSliderType.POPULAR_MOVIES, enabled: true, isBuiltIn: true, order: 7 },
  { type: DashboardSliderType.POPULAR_TV, enabled: true, isBuiltIn: true, order: 8 },
  { type: DashboardSliderType.MOVIE_GENRES, enabled: true, isBuiltIn: true, order: 9 },
  { type: DashboardSliderType.UPCOMING_MOVIES, enabled: true, isBuiltIn: true, order: 10 },
  { type: DashboardSliderType.TV_GENRES, enabled: true, isBuiltIn: true, order: 11 },
  { type: DashboardSliderType.UPCOMING_TV, enabled: true, isBuiltIn: true, order: 12 },
  { type: DashboardSliderType.TOP_RATED_MOVIES, enabled: true, isBuiltIn: true, order: 13 },
  { type: DashboardSliderType.TOP_RATED_TV, enabled: true, isBuiltIn: true, order: 14 },
  { type: DashboardSliderType.NETWORKS, enabled: true, isBuiltIn: true, order: 15 },
];

export function getDashboardSliderLabel(slider: Pick<DashboardSlider, "type" | "title" | "isBuiltIn">): string {
  if (slider.isBuiltIn) return dashboardSliderTitles[Number(slider.type)] ?? "Unknown";
  return slider.title?.trim() || dashboardSliderTitles[Number(slider.type)] || "Custom Slider";
}

