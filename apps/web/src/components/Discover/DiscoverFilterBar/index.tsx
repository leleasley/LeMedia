"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import useSWR from "swr";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";

type Genre = { id: number; name: string };
type Language = { iso_639_1: string; english_name: string; name: string };
type Provider = { provider_id: number; provider_name: string; logo_path?: string | null };
type Company = { id: number; name: string };

type DiscoverPreset = {
  id: string;
  mediaType: "movie" | "tv";
  name: string;
  filters: DiscoverFiltersState;
  alertsEnabled: boolean;
  pinned: boolean;
};

type SortValue =
  | "popularity_desc"
  | "popularity_asc"
  | "release_desc"
  | "release_asc"
  | "rating_desc"
  | "rating_asc"
  | "title_asc"
  | "title_desc"
  | "recently_added";

export type DiscoverFiltersState = {
  sort: SortValue;
  genres: number[];
  releaseFrom: string;
  releaseTo: string;
  language: string;
  providers: number[];
  monetization: string;
  studio: Company | null;
  watchRegion: string;
  runtimeMin: string;
  runtimeMax: string;
  ratingMin: string;
  ratingMax: string;
  voteCountMin: string;
  voteCountMax: string;
  keywords: string;
  excludeKeywords: string;
  status?: string;
};

export const DEFAULT_WATCH_REGION = (process.env.NEXT_PUBLIC_TMDB_REGION ?? "US").toUpperCase();

const availabilityOptions = [
  { value: "", label: "Any" },
  { value: "flatrate", label: "Streaming" },
  { value: "free", label: "Free" },
  { value: "ads", label: "Ads" },
  { value: "rent", label: "Rent" },
  { value: "buy", label: "Buy" },
];

const movieSortOptions = [
  { value: "popularity_desc", label: "Popularity Descending" },
  { value: "popularity_asc", label: "Popularity Ascending" },
  { value: "rating_desc", label: "Rating Descending" },
  { value: "rating_asc", label: "Rating Ascending" },
  { value: "release_desc", label: "Release Date Descending" },
  { value: "release_asc", label: "Release Date Ascending" },
  { value: "title_asc", label: "Title (A-Z)" },
  { value: "title_desc", label: "Title (Z-A)" },
  { value: "recently_added", label: "Recently Added" },
];

const tvSortOptions = [
  { value: "popularity_desc", label: "Popularity Descending" },
  { value: "popularity_asc", label: "Popularity Ascending" },
  { value: "rating_desc", label: "Rating Descending" },
  { value: "rating_asc", label: "Rating Ascending" },
  { value: "release_desc", label: "First Air Date Descending" },
  { value: "release_asc", label: "First Air Date Ascending" },
  { value: "title_asc", label: "Title (A-Z)" },
  { value: "title_desc", label: "Title (Z-A)" },
  { value: "recently_added", label: "Recently Added" },
];

const regionOptions = ["US", "GB", "CA", "AU", "DE", "FR", "IN", "BR", "ES", "SE"];

const inputFieldClass =
  "w-full rounded border border-gray-700 bg-gray-800/50 px-2 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

export function DiscoverFilterBar({
  type,
  title,
  filters,
  onChange,
}: {
  type: "movie" | "tv";
  title: string;
  filters: DiscoverFiltersState;
  onChange: (next: DiscoverFiltersState) => void;
}) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [draftFilters, setDraftFilters] = useState<DiscoverFiltersState>(filters);
  const [studioQuery, setStudioQuery] = useState(filters.studio?.name ?? "");
  const [studioResults, setStudioResults] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [presetBusyId, setPresetBusyId] = useState<string | null>(null);
  const [savingPreset, setSavingPreset] = useState(false);
  const toast = useToast();

  const { data: presetsData, mutate: mutatePresets } = useSWR<{ presets: DiscoverPreset[] }>(
    `/api/discover-presets?mediaType=${type}`,
    { revalidateOnFocus: false }
  );
  const presets = Array.isArray(presetsData?.presets) ? presetsData!.presets : [];

  // Lock body scroll when filter panel is open
  useLockBodyScroll(panelOpen);

  const sortOptions = type === "movie" ? movieSortOptions : tvSortOptions;
  const defaultRegion = DEFAULT_WATCH_REGION;
  const providerRegion = (draftFilters.watchRegion || defaultRegion).toUpperCase();

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.genres.length) count += 1;
    if (filters.releaseFrom || filters.releaseTo) count += 1;
    if (filters.language) count += 1;
    if (filters.providers.length) count += 1;
    if (filters.watchRegion && filters.watchRegion.toUpperCase() !== defaultRegion) count += 1;
    if (filters.monetization) count += 1;
    if (filters.studio) count += 1;
    if (filters.runtimeMin || filters.runtimeMax) count += 1;
    if (filters.ratingMin || filters.ratingMax) count += 1;
    if (filters.voteCountMin || filters.voteCountMax) count += 1;
    if (filters.keywords) count += 1;
    if (filters.excludeKeywords) count += 1;
    if (filters.status) count += 1;
    return count;
  }, [filters, defaultRegion]);

  const openPanel = () => {
    setDraftFilters(filters);
    setStudioQuery(filters.studio?.name ?? "");
    setPanelOpen(true);
  };

  const applyPreset = useCallback((preset: DiscoverPreset) => {
    const nextFilters = { ...filters, ...(preset.filters ?? {}) };
    setDraftFilters(nextFilters);
    setStudioQuery(nextFilters.studio?.name ?? "");
    onChange(nextFilters);
    setPanelOpen(false);
  }, [filters, onChange]);

  const savePreset = useCallback(async () => {
    if (savingPreset) return;
    const name = window.prompt("Name this preset");
    const trimmedName = name?.trim();
    if (!trimmedName) return;

    setSavingPreset(true);
    try {
      const response = await csrfFetch("/api/discover-presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: type,
          name: trimmedName,
          filters: draftFilters,
        }),
      });

      if (!response.ok) throw new Error("Failed to save preset");
      await mutatePresets();
      toast.success("Preset saved.");
    } catch {
      toast.error("Could not save this preset.");
    } finally {
      setSavingPreset(false);
    }
  }, [draftFilters, mutatePresets, savingPreset, toast, type]);

  const patchPreset = useCallback(async (presetId: string, patch: { alertsEnabled?: boolean; pinned?: boolean }) => {
    setPresetBusyId(presetId);
    try {
      const response = await csrfFetch(`/api/discover-presets/${presetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Failed to update preset");
      await mutatePresets();
    } catch {
      toast.error("Could not update this preset.");
    } finally {
      setPresetBusyId(null);
    }
  }, [mutatePresets, toast]);

  const deletePreset = useCallback(async (presetId: string) => {
    setPresetBusyId(presetId);
    try {
      const response = await csrfFetch(`/api/discover-presets/${presetId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to delete preset");
      await mutatePresets();
      toast.success("Preset removed.");
    } catch {
      toast.error("Could not remove this preset.");
    } finally {
      setPresetBusyId(null);
    }
  }, [mutatePresets, toast]);

  useEffect(() => {
    if (!panelOpen) return;
    if (genres.length > 0 && languages.length > 0 && providers.length > 0) return; // Already loaded

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      try {
        const region = providerRegion || defaultRegion;
        const [genreRes, langRes, providerRes] = await Promise.all([
          fetch(`/api/tmdb/genres?type=${type}`),
          fetch("/api/tmdb/languages"),
          fetch(`/api/tmdb/watch-providers?type=${type}&region=${encodeURIComponent(region)}`),
        ]);
        if (cancelled) return;

        const [genreData, langData, providerData] = await Promise.all([
          genreRes.json(),
          langRes.json(),
          providerRes.json(),
        ]);

        if (cancelled) return;
        setGenres(genreData.genres ?? []);
        setLanguages((langData.languages ?? []).filter((l: Language) => l.iso_639_1));
        setProviders(providerData.results ?? []);
      } catch (error) {
        if (cancelled) return;
        logger.error("Failed to load filter data", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [panelOpen, type, providerRegion, defaultRegion, genres.length, languages.length, providers.length]);

  useEffect(() => {
    if (!panelOpen) return;
    const handler = window.setTimeout(async () => {
      const query = studioQuery.trim();
      if (query.length < 2) {
        setStudioResults([]);
        return;
      }
      const res = await fetch(`/api/tmdb/company-search?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      setStudioResults(data.results ?? []);
    }, 250);
    return () => window.clearTimeout(handler);
  }, [studioQuery, panelOpen]);

  // Sync studio query with applied filters when panel is closed
  const derivedStudioQuery = filters.studio?.name ?? "";
  if (!panelOpen && studioQuery !== derivedStudioQuery) {
    setStudioQuery(derivedStudioQuery);
  }

  const updateDraftFilters = (patch: Partial<DiscoverFiltersState>) => {
    setDraftFilters(prev => ({ ...prev, ...patch }));
  };

  const toggleGenre = (id: number) => {
    const has = draftFilters.genres.includes(id);
    const next = has ? draftFilters.genres.filter(g => g !== id) : [...draftFilters.genres, id];
    updateDraftFilters({ genres: next });
  };

  const toggleProvider = (id: number) => {
    const has = draftFilters.providers.includes(id);
    const next = has ? draftFilters.providers.filter(p => p !== id) : [...draftFilters.providers, id];
    updateDraftFilters({ providers: next });
  };

  const clearFilters = () => {
    updateDraftFilters({
      genres: [],
      releaseFrom: "",
      releaseTo: "",
      language: "",
      providers: [],
      monetization: "",
      studio: null,
      watchRegion: defaultRegion,
      runtimeMin: "",
      runtimeMax: "",
      ratingMin: "",
      ratingMax: "",
      voteCountMin: "",
      voteCountMax: "",
      keywords: "",
      excludeKeywords: "",
      status: "",
    });
    setStudioQuery("");
  };

  const applyFilters = () => {
    onChange(draftFilters);
    setPanelOpen(false);
  };

  return (
    <div className="mb-3 sm:mb-4 px-2 sm:px-4">
      {/* Mobile Header - Compact design */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-xl font-bold text-white">{title}</h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-indigo-400/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-100 transition-all hover:bg-indigo-500/15 disabled:opacity-60"
              onClick={() => void savePreset()}
              disabled={savingPreset}
            >
              {savingPreset ? "Saving..." : "Save view"}
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/90 hover:bg-white/10 active:scale-95 transition-all"
              onClick={openPanel}
            >
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5H17L11.5 11V15L8.5 16.5V11L3 5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
            </button>
          </div>
        </div>
        {presets.length > 0 ? (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/85 transition-colors hover:bg-white/10"
              >
                {preset.pinned ? "Pinned" : "Saved"} · {preset.name}
              </button>
            ))}
          </div>
        ) : null}
        <AdaptiveSelect
          value={filters.sort}
          onValueChange={(value) => onChange({ ...filters, sort: value as SortValue })}
          options={sortOptions}
          placeholder="Sort by"
          className="w-full"
        />
      </div>

      {/* Desktop Header - Original design */}
      <div className="hidden sm:flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {presets.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/85 transition-colors hover:bg-white/10"
                >
                  {preset.pinned ? "Pinned" : "Saved"} · {preset.name}{preset.alertsEnabled ? " · Alerts" : ""}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void savePreset()}
            disabled={savingPreset}
            className="rounded border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-100 hover:bg-indigo-500/15 disabled:opacity-60"
          >
            {savingPreset ? "Saving..." : "Save view"}
          </button>
          <AdaptiveSelect
            value={filters.sort}
            onValueChange={(value) => onChange({ ...filters, sort: value as SortValue })}
            options={sortOptions}
            className="w-56"
          />

          <button
            type="button"
            className="flex items-center gap-2 rounded border border-gray-700 bg-gray-800/90 px-3 py-2 text-sm text-white hover:border-gray-600 hover:bg-gray-700/90"
            onClick={openPanel}
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 5H17L11.5 11V15L8.5 16.5V11L3 5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-xs font-medium">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {panelOpen && typeof document !== "undefined"
        ? createPortal(
          <div className="fixed inset-0 z-[1000] flex">
            <button
              type="button"
              className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${panelOpen ? 'opacity-100' : 'opacity-0'}`}
              onClick={() => setPanelOpen(false)}
              aria-label="Close filters"
            />
            <div
              className={`relative z-[1001] ml-auto flex h-full w-[400px] sm:w-[450px] flex-col border-l border-white/10 bg-gray-900 shadow-2xl transform transition-transform duration-300 ease-in-out ${
                panelOpen ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <div className="flex items-center justify-between border-b border-gray-800 px-4 py-4">
                <h2 className="text-lg font-semibold text-white">Filters</h2>
                <div className="flex items-center gap-3">
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      className="text-sm text-gray-400 hover:text-white transition-colors"
                      onClick={clearFilters}
                    >
                      Clear All
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                    onClick={() => setPanelOpen(false)}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="inline-flex">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-indigo-500"></div>
                    </div>
                    <p className="text-sm text-gray-400">Loading filters...</p>
                  </div>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="space-y-5">
                  {presets.length > 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Saved Presets</p>
                          <p className="mt-1 text-xs text-gray-500">Pin a filter to surface it on Discover and the dashboard, or flag it for alerts later.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void savePreset()}
                          disabled={savingPreset}
                          className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-100 hover:bg-indigo-500/15 disabled:opacity-60"
                        >
                          {savingPreset ? "Saving..." : "Save current"}
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {presets.map((preset) => (
                          <div key={preset.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <button
                                type="button"
                                onClick={() => applyPreset(preset)}
                                className="min-w-0 text-left"
                              >
                                <p className="truncate text-sm font-semibold text-white">{preset.name}</p>
                                <p className="mt-1 text-xs text-gray-400">
                                  {preset.pinned ? "Pinned" : "Saved"}
                                  {preset.alertsEnabled ? " · Alerts on" : " · Alerts off"}
                                </p>
                              </button>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void patchPreset(preset.id, { pinned: !preset.pinned })}
                                  disabled={presetBusyId === preset.id}
                                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-50"
                                >
                                  {preset.pinned ? "Unpin" : "Pin"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void patchPreset(preset.id, { alertsEnabled: !preset.alertsEnabled })}
                                  disabled={presetBusyId === preset.id}
                                  className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/80 hover:bg-white/10 disabled:opacity-50"
                                >
                                  {preset.alertsEnabled ? "Alerts on" : "Alert me"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deletePreset(preset.id)}
                                  disabled={presetBusyId === preset.id}
                                  className="rounded-md border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-100 hover:bg-rose-500/15 disabled:opacity-50"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-3 text-xs text-gray-500">
                      Save combinations like late-night horror, new sci-fi, or short comfort rewatches and pin them here.
                    </div>
                  )}

                  {genres.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">Genres</label>
                      <div className="mb-2">
                        <AdaptiveSelect
                          value=""
                          onValueChange={(value) => {
                            const id = Number(value);
                            if (Number.isFinite(id)) toggleGenre(id);
                          }}
                          options={genres.map((genre) => ({ value: String(genre.id), label: genre.name }))}
                          placeholder="Add genre"
                          className="w-full"
                        />
                      </div>
                      {draftFilters.genres.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {genres
                            .filter(genre => draftFilters.genres.includes(genre.id))
                            .map(genre => (
                              <button
                                key={genre.id}
                                type="button"
                                className="flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-sm text-white transition hover:bg-indigo-500"
                                onClick={() => toggleGenre(genre.id)}
                              >
                                <span>{genre.name}</span>
                                <span className="text-xs text-white/80">×</span>
                              </button>
                            ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No genres selected.</p>
                      )}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                        From Date
                      </label>
                      <input
                        type="date"
                        value={draftFilters.releaseFrom || ""}
                        onChange={(e) => {
                          const date = e.target.value;
                          updateDraftFilters({ releaseFrom: date });
                        }}
                        className={inputFieldClass}
                        placeholder="Any"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                        To Date
                      </label>
                      <input
                        type="date"
                        value={draftFilters.releaseTo || ""}
                        onChange={(e) => {
                          const date = e.target.value;
                          updateDraftFilters({ releaseTo: date });
                        }}
                        className={inputFieldClass}
                        placeholder="Any"
                      />
                    </div>
                  </div>

                  {languages.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">Language</label>
                      <AdaptiveSelect
                        value={draftFilters.language || "any"}
                        onValueChange={(value) => updateDraftFilters({ language: value === "any" ? "" : value })}
                        options={[
                          { value: "any", label: "Any" },
                          ...languages.map(lang => ({ value: lang.iso_639_1, label: lang.english_name || lang.name }))
                        ]}
                        placeholder="Any"
                        className="w-full"
                      />
                    </div>
                  )}

                  {providers.length > 0 && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                        Streaming Services ({providerRegion})
                      </label>
                      <div className="mb-2">
                        <AdaptiveSelect
                          value=""
                          onValueChange={(value) => {
                            const id = Number(value);
                            if (Number.isFinite(id)) toggleProvider(id);
                          }}
                          options={providers.map((provider) => ({
                            value: String(provider.provider_id),
                            label: provider.provider_name
                          }))}
                          placeholder="Add service"
                          className="w-full"
                        />
                      </div>
                      {draftFilters.providers.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {providers
                            .filter(provider => draftFilters.providers.includes(provider.provider_id))
                            .map(provider => (
                              <button
                                key={provider.provider_id}
                                type="button"
                                className="flex items-center gap-2 rounded-full bg-indigo-600 px-3 py-1 text-sm text-white transition hover:bg-indigo-500"
                                onClick={() => toggleProvider(provider.provider_id)}
                              >
                                {provider.logo_path ? (
                                  <Image
                                    src={`https://image.tmdb.org/t/p/w45${provider.logo_path}`}
                                    alt={provider.provider_name}
                                    width={20}
                                    height={20}
                                    className="h-5 w-5 rounded bg-gray-800 object-contain"
                                  />
                                ) : (
                                  <div className="h-5 w-5 rounded bg-indigo-700/60" />
                                )}
                                <span>{provider.provider_name}</span>
                                <span className="text-xs text-white/80">×</span>
                              </button>
                            ))}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500">No services selected.</p>
                      )}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                        Min Rating
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="10"
                        value={draftFilters.ratingMin}
                        onChange={(e) => updateDraftFilters({ ratingMin: e.target.value })}
                        className={inputFieldClass}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
                        Max Rating
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        max="10"
                        value={draftFilters.ratingMax}
                        onChange={(e) => updateDraftFilters({ ratingMax: e.target.value })}
                        className={inputFieldClass}
                        placeholder="10"
                      />
                    </div>
                  </div>

                  {type === "tv" && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">Status</label>
                      <select
                        className={inputFieldClass}
                        value={draftFilters.status ?? ""}
                        onChange={(e) => updateDraftFilters({ status: e.target.value })}
                      >
                        <option value="">Any</option>
                        <option value="0">Returning Series</option>
                        <option value="3">Ended</option>
                        <option value="4">Cancelled</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
              )}

              <div className="border-t border-gray-800 px-4 py-4">
                <button
                  type="button"
                  className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={applyFilters}
                  disabled={isLoading}
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
        : null}
    </div>
  );
}
