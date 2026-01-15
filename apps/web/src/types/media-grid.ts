export type MediaGridItem = {
  id: number;
  title?: string;
  name?: string;
  poster_path?: string;
  backdrop_path?: string;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
  genre_ids?: number[];
  media_type?: string;
  overview?: string;
};

export type MediaGridPage = {
  results: MediaGridItem[];
  total_pages?: number;
  total_results?: number;
  page?: number;
};
