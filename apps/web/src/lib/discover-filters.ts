import { DEFAULT_WATCH_REGION, type DiscoverFiltersState } from "@/components/Discover/DiscoverFilterBar";

type MediaType = "movie" | "tv";

const DEFAULT_SORT = "popularity_desc";

export function defaultDiscoverFilters(): DiscoverFiltersState {
  return {
    sort: DEFAULT_SORT,
    genres: [],
    releaseFrom: "",
    releaseTo: "",
    language: "",
    providers: [],
    monetization: "",
    studio: null,
    watchRegion: DEFAULT_WATCH_REGION,
    runtimeMin: "",
    runtimeMax: "",
    ratingMin: "",
    ratingMax: "",
    voteCountMin: "",
    voteCountMax: "",
    keywords: "",
    excludeKeywords: "",
    status: "",
  };
}

function parseNumberList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

export function parseDiscoverFilters(params: URLSearchParams, type: MediaType): DiscoverFiltersState {
  const defaults = defaultDiscoverFilters();
  const sort = params.get("sort") ?? DEFAULT_SORT;
  const watchRegion = (params.get("watchRegion") ?? defaults.watchRegion).toUpperCase();
  const studioId = params.get("studioId");
  const studioName = params.get("studioName");

  return {
    ...defaults,
    sort: sort as DiscoverFiltersState["sort"],
    genres: parseNumberList(params.get("genres")),
    releaseFrom: params.get("releaseFrom") ?? "",
    releaseTo: params.get("releaseTo") ?? "",
    language: params.get("language") ?? "",
    providers: parseNumberList(params.get("providers")),
    monetization: params.get("monetization") ?? "",
    studio: studioId && studioName ? { id: Number(studioId), name: studioName } : null,
    watchRegion,
    runtimeMin: params.get("runtimeMin") ?? "",
    runtimeMax: params.get("runtimeMax") ?? "",
    ratingMin: params.get("ratingMin") ?? "",
    ratingMax: params.get("ratingMax") ?? "",
    voteCountMin: params.get("voteCountMin") ?? "",
    voteCountMax: params.get("voteCountMax") ?? "",
    keywords: params.get("keywords") ?? "",
    excludeKeywords: params.get("excludeKeywords") ?? "",
    status: type === "tv" ? params.get("status") ?? "" : "",
  };
}

export function buildDiscoverSearchParams(filters: DiscoverFiltersState, type: MediaType) {
  const defaults = defaultDiscoverFilters();
  const params = new URLSearchParams();

  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set("sort", filters.sort);
  if (filters.genres.length) params.set("genres", filters.genres.join(","));
  if (filters.releaseFrom) params.set("releaseFrom", filters.releaseFrom);
  if (filters.releaseTo) params.set("releaseTo", filters.releaseTo);
  if (filters.language) params.set("language", filters.language);
  if (filters.providers.length) params.set("providers", filters.providers.join(","));
  if (filters.monetization) params.set("monetization", filters.monetization);
  if (filters.studio) {
    params.set("studioId", String(filters.studio.id));
    params.set("studioName", filters.studio.name);
  }
  if (filters.watchRegion && filters.watchRegion.toUpperCase() !== defaults.watchRegion.toUpperCase()) {
    params.set("watchRegion", filters.watchRegion.toUpperCase());
  }
  if (filters.runtimeMin) params.set("runtimeMin", filters.runtimeMin);
  if (filters.runtimeMax) params.set("runtimeMax", filters.runtimeMax);
  if (filters.ratingMin) params.set("ratingMin", filters.ratingMin);
  if (filters.ratingMax) params.set("ratingMax", filters.ratingMax);
  if (filters.voteCountMin) params.set("voteCountMin", filters.voteCountMin);
  if (filters.voteCountMax) params.set("voteCountMax", filters.voteCountMax);
  if (filters.keywords) params.set("keywords", filters.keywords);
  if (filters.excludeKeywords) params.set("excludeKeywords", filters.excludeKeywords);
  if (type === "tv" && filters.status) params.set("status", filters.status);

  return params;
}
