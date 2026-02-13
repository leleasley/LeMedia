"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Modal } from "@/components/Common/Modal";
import { readJson } from "@/lib/fetch-utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { logger } from "@/lib/logger";
import { Check, X, Loader2, ChevronDown, Tv, CheckCircle, Info, Star, Search as SearchIcon, Package } from "lucide-react";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { ReleaseSearchModal } from "@/components/Media/ReleaseSearchModal";

type QualityProfile = { id: number; name: string };

type Episode = {
  episode_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string;
  vote_average: number;
  available?: boolean;
  requested?: boolean;
  requestStatus?: string | null;
  downloading?: boolean;
};

type Season = {
  season_number: number;
  episode_count: number;
  name: string;
  poster_path: string | null;
};

type MonitoringOption =
  | "all"
  | "future"
  | "missing"
  | "existing"
  | "recent"
  | "pilot"
  | "firstSeason"
  | "lastSeason"
  | "monitorSpecials"
  | "unmonitorSpecials"
  | "none";

const monitoringOptions: Array<{ value: MonitoringOption; label: string }> = [
  { value: "all", label: "All Episodes" },
  { value: "future", label: "Future Episodes" },
  { value: "missing", label: "Missing Episodes" },
  { value: "existing", label: "Existing Episodes" },
  { value: "recent", label: "Recent Episodes" },
  { value: "pilot", label: "Pilot Episode" },
  { value: "firstSeason", label: "First Season" },
  { value: "lastSeason", label: "Last Season" },
  { value: "monitorSpecials", label: "Monitor Specials" },
  { value: "unmonitorSpecials", label: "Unmonitor Specials" },
  { value: "none", label: "None" }
];

function toMonitoringOption(value: string | null | undefined): MonitoringOption {
  const valid = monitoringOptions.some((option) => option.value === value);
  return valid ? (value as MonitoringOption) : "all";
}

export function SeriesRequestModal({
  open,
  onClose,
  tmdbId,
  tvdbId,
  qualityProfiles,
  defaultQualityProfileId,
  requestsBlocked = false,
  title = "",
  year,
  posterUrl,
  backdropUrl,
  onRequestPlaced,
  isLoading = false,
  isAdmin = false,
  prowlarrEnabled = false,
  serviceItemId = null,
  defaultMonitoringOption = "all"
}: {
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  tvdbId?: number | null;
  qualityProfiles: QualityProfile[];
  defaultQualityProfileId: number;
  requestsBlocked?: boolean;
  title?: string;
  year?: string | number | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  onRequestPlaced?: () => void;
  isLoading?: boolean;
  isAdmin?: boolean;
  prowlarrEnabled?: boolean;
  serviceItemId?: number | null;
  defaultMonitoringOption?: string;
}) {
  const [selectedQualityProfileId, setSelectedQualityProfileId] = useState<number>(defaultQualityProfileId);
  const [selectedMonitoringOption, setSelectedMonitoringOption] = useState<MonitoringOption>(toMonitoringOption(defaultMonitoringOption));
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [episodeSearchOpen, setEpisodeSearchOpen] = useState(false);
  const [selectedEpisodeForSearch, setSelectedEpisodeForSearch] = useState<{ seasonNumber: number; episodeNumber: number; name: string; air_date: string | null } | null>(null);
  const [seasonPackSearchOpen, setSeasonPackSearchOpen] = useState(false);
  const [selectedSeasonForSearch, setSelectedSeasonForSearch] = useState<{ seasonNumber: number; name: string } | null>(null);
  const router = useRouter();
  const toast = useToast();

  // Season/episode state
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState<Record<number, Episode[]>>({});
  const [loadingEpisodes, setLoadingEpisodes] = useState<Set<number>>(new Set());
  const [checkedEpisodes, setCheckedEpisodes] = useState<Record<number, Set<number>>>({});
  const prefetchStartedRef = useRef(false);

  const blockedMessage = "Requesting blocked until notifications are applied";

  // Load seasons when modal opens
  useEffect(() => {
    if (!open || !tmdbId) return;

    const abortController = new AbortController();

    const loadSeasonsWithAbort = async () => {
      setLoadingSeasons(true);
      try {
        const res = await fetch(`/api/v1/tmdb/tv/${tmdbId}`, { signal: abortController.signal });
        if (res.ok) {
          const data = await res.json();
          // Filter out season 0 (specials) unless it's the only season
          const allSeasons = (data.seasons || []).filter((s: Season) => s.season_number > 0 || data.seasons.length === 1);

          if (abortController.signal.aborted) return;
          setSeasons(allSeasons);

          // Episodes are loaded lazily when a season is expanded.
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          logger.error("Failed to load seasons", err);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoadingSeasons(false);
        }
      }
    };

    loadSeasonsWithAbort();

    return () => {
      abortController.abort();
    };
  }, [open, tmdbId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setExpandedSeason(null);
      setSeasonEpisodes({});
      setCheckedEpisodes({});
      setSubmitState("idle");
      setEpisodeSearchOpen(false);
      setSelectedEpisodeForSearch(null);
      setSeasonPackSearchOpen(false);
      setSelectedSeasonForSearch(null);
      prefetchStartedRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelectedMonitoringOption(toMonitoringOption(defaultMonitoringOption));
  }, [open, defaultMonitoringOption]);

  useEffect(() => {
    if (!open || seasons.length === 0 || prefetchStartedRef.current) return;
    prefetchStartedRef.current = true;
    let cancelled = false;
    const controller = new AbortController();
    const seasonParams = tvdbId ? `?tvdbId=${encodeURIComponent(String(tvdbId))}` : "";

    const prefetch = async () => {
      const seasonNumbers = seasons.map(s => s.season_number).filter(sn => !seasonEpisodes[sn]);
      if (seasonNumbers.length === 0) return;

      const concurrency = 3;
      let index = 0;
      const worker = async () => {
        while (!cancelled && index < seasonNumbers.length) {
          const seasonNumber = seasonNumbers[index++];
          try {
            const res = await fetch(
              `/api/v1/tmdb/tv/${tmdbId}/season/${seasonNumber}/fast${seasonParams}`,
              { signal: controller.signal }
            );
            if (!res.ok) continue;
            const data = await res.json();
            if (!cancelled && data?.episodes) {
              setSeasonEpisodes(prev => (prev[seasonNumber] ? prev : { ...prev, [seasonNumber]: data.episodes || [] }));
            }
          } catch {
            // ignore prefetch errors
          }
        }
      };

      await Promise.all(Array.from({ length: concurrency }, () => worker()));
    };

    // Run immediately so season availability badges are ready without
    // requiring the user to expand/click each season first.
    prefetch();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, seasons, seasonEpisodes, tmdbId, tvdbId]);

  async function loadSeasonEpisodes(seasonNumber: number): Promise<Episode[]> {
    if (seasonEpisodes[seasonNumber]) return seasonEpisodes[seasonNumber];

    setLoadingEpisodes(prev => new Set(prev).add(seasonNumber));
    try {
      const seasonParams = tvdbId ? `?tvdbId=${encodeURIComponent(String(tvdbId))}` : "";
      const res = await fetch(`/api/v1/tmdb/tv/${tmdbId}/season/${seasonNumber}/fast${seasonParams}`);
      if (res.ok) {
        const data = await res.json();
        const episodes = data.episodes || [];
        setSeasonEpisodes(prev => ({ ...prev, [seasonNumber]: episodes }));
        return episodes;
      }
    } catch (err) {
      logger.error("Failed to load episodes", err);
    } finally {
      setLoadingEpisodes(prev => {
        const next = new Set(prev);
        next.delete(seasonNumber);
        return next;
      });
    }
    return [];
  }

  function toggleSeason(seasonNumber: number) {
    if (expandedSeason === seasonNumber) {
      setExpandedSeason(null);
    } else {
      setExpandedSeason(seasonNumber);
      loadSeasonEpisodes(seasonNumber);
    }
  }

  function toggleEpisode(seasonNumber: number, episodeNumber: number, episode?: Episode) {
    if (episode?.available || episode?.requested || episode?.downloading) return;

    setCheckedEpisodes(prev => {
      const seasonChecked = new Set(prev[seasonNumber] || []);
      if (seasonChecked.has(episodeNumber)) {
        seasonChecked.delete(episodeNumber);
      } else {
        seasonChecked.add(episodeNumber);
      }
      return { ...prev, [seasonNumber]: seasonChecked };
    });
  }

  async function toggleSeasonSelection(seasonNumber: number) {
    const episodes = seasonEpisodes[seasonNumber] || (await loadSeasonEpisodes(seasonNumber));
    const selectable = episodes.filter(e => !(e.available || e.requested || e.downloading)).map(e => e.episode_number);
    const currentChecked = checkedEpisodes[seasonNumber] || new Set<number>();
    const allChecked = selectable.length > 0 && currentChecked.size === selectable.length;
    setCheckedEpisodes(prev => ({
      ...prev,
      [seasonNumber]: allChecked ? new Set() : new Set(selectable)
    }));
  }

  function getTotalCheckedCount() {
    return Object.values(checkedEpisodes).reduce((sum, set) => sum + set.size, 0);
  }

  function getCheckedCount(seasonNumber: number) {
    return checkedEpisodes[seasonNumber]?.size || 0;
  }

  async function requestSelectedEpisodes() {
    if (isSubmitting) return;
    if (requestsBlocked) {
      setErrorModal({ title: "Requesting blocked", message: blockedMessage });
      return;
    }

    const totalChecked = getTotalCheckedCount();
    if (totalChecked === 0) {
      toast.error("Please select at least one episode", { timeoutMs: 3000 });
      return;
    }

    setIsSubmitting(true);
    setSubmitState("loading");

    try {
      const seasons = Object.keys(checkedEpisodes)
        .map(Number)
        .filter(seasonNumber => checkedEpisodes[seasonNumber]?.size > 0)
        .map(seasonNumber => ({
          seasonNumber,
          episodeNumbers: Array.from(checkedEpisodes[seasonNumber] || []).sort((a, b) => a - b)
        }))
        .filter(season => season.episodeNumbers.length > 0);

      const res = await csrfFetch("/api/v1/request/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmdbTvId: tmdbId,
          seasons,
          qualityProfileId: selectedQualityProfileId,
          monitoringOption: selectedMonitoringOption
        })
      });

      const j = await readJson(res);

      if (!res.ok) {
        if (j?.error === "notifications_required") {
          setErrorModal({ title: "Requesting blocked", message: blockedMessage });
          setSubmitState("error");
          setTimeout(() => setSubmitState("idle"), 2000);
          return;
        }

        if (res.status === 422 && j?.error === "missing_episodes" && Array.isArray(j?.missingEpisodes)) {
          const missingList = j.missingEpisodes
            .map((ep: { seasonNumber: number; episodeNumber: number }) => `S${ep.seasonNumber}E${String(ep.episodeNumber).padStart(2, "0")}`)
            .join(", ");
          setErrorModal({
            title: "Some episodes could not be matched in Sonarr",
            message: missingList ? `Missing in Sonarr: ${missingList}` : "Some episodes could not be matched in Sonarr."
          });
          setSubmitState("error");
          setTimeout(() => setSubmitState("idle"), 2000);
          return;
        }

        if (res.status === 409 && j?.error === "already_requested") {
          toast.info("All selected episodes have already been requested", { timeoutMs: 3000 });
          setSubmitState("idle");
          return;
        }

        throw new Error(j?.error || j?.message || "Request failed");
      }

      const successCount = Number(j?.count ?? 0);
      const skippedCount = Array.isArray(j?.skippedEpisodes) ? j.skippedEpisodes.length : Number(j?.skipped ?? 0);
      if (successCount > 0) {
        toast.success(`Successfully requested ${successCount} episode${successCount !== 1 ? "s" : ""}!`, { timeoutMs: 3000 });
        if (skippedCount > 0) {
          toast.info(`Skipped ${skippedCount} episode${skippedCount !== 1 ? "s" : ""} already requested.`, { timeoutMs: 3000 });
        }
        setSubmitState("success");
        router.refresh();
        if (onRequestPlaced) onRequestPlaced();
        setTimeout(() => {
          setCheckedEpisodes({});
          onClose();
        }, 1500);
      } else {
        toast.info("All selected episodes have already been requested", { timeoutMs: 3000 });
        setSubmitState("idle");
      }
    } catch (e: any) {
      toast.error(`Failed to submit request: ${e?.message ?? String(e)}`, { timeoutMs: 4000 });
      setSubmitState("error");
      setTimeout(() => setSubmitState("idle"), 2000);
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setCheckedEpisodes({});
      setSubmitState("idle");
      onClose();
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "TBA";
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const totalSelected = getTotalCheckedCount();

  return (
    <>
      <Modal open={!!errorModal} title={errorModal?.title ?? ""} onClose={() => setErrorModal(null)}>
        {errorModal?.message ?? ""}
      </Modal>

      <Modal
        open={open}
        title={`Request ${title || "Series"}`}
        onClose={handleClose}
        backgroundImage={backdropUrl ?? posterUrl ?? undefined}
      >
        {isLoading || loadingSeasons ? (
          <div className="flex items-center justify-center py-8">
            <div className="space-y-3 text-center">
              <div className="inline-flex">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-600 border-t-indigo-500"></div>
              </div>
              <p className="text-sm text-gray-400">Loading seasons...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Media Preview Card */}
            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02]">
              {/* Backdrop blur effect */}
              {backdropUrl && (
                <div className="absolute inset-0">
                  <Image
                    src={backdropUrl}
                    alt=""
                    fill
                    className="object-cover opacity-30 blur-sm scale-110"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-900/90 via-gray-900/70 to-gray-900/90" />
                </div>
              )}
              
              <div className="relative flex gap-4 p-4">
                {/* Poster */}
                <div className="relative w-16 h-24 sm:w-20 sm:h-[120px] rounded-xl overflow-hidden bg-gray-800 flex-shrink-0 ring-1 ring-white/10 shadow-xl">
                  {posterUrl ? (
                    <Image
                      src={posterUrl}
                      alt={title || ""}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                      <Tv className="w-8 h-8 text-gray-500" />
                    </div>
                  )}
                </div>
                
                {/* Media Info */}
                <div className="flex flex-col justify-center min-w-0 py-1">
                  <h3 className="text-base sm:text-lg font-bold text-white leading-tight line-clamp-2">
                    {title || "Series"}
                  </h3>
                  {year && (
                    <p className="text-sm text-gray-400 mt-1">{year}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-300 border border-purple-500/30">
                      <Tv className="w-3 h-3" />
                      TV Series
                    </span>
                    {seasons.length > 0 && (
                      <span className="text-xs text-gray-500">
                        {seasons.length} season{seasons.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quality Profile Selection */}
            {qualityProfiles.length > 0 && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"></span>
                  Quality Profile
                </label>
                <AdaptiveSelect
                  value={String(selectedQualityProfileId)}
                  onValueChange={(value) => setSelectedQualityProfileId(Number(value))}
                  disabled={isSubmitting}
                  options={qualityProfiles.map((profile) => ({
                    value: String(profile.id),
                    label: profile.name
                  }))}
                  placeholder="Select quality profile"
                  className="w-full"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-200">
                <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-violet-400 to-purple-400"></span>
                Monitoring
              </label>
              <AdaptiveSelect
                value={selectedMonitoringOption}
                onValueChange={(value) => setSelectedMonitoringOption(value as MonitoringOption)}
                disabled={isSubmitting}
                options={monitoringOptions}
                placeholder="Select monitoring"
                className="w-full"
              />
            </div>

            {/* Search for Series Packs */}
            {isAdmin && prowlarrEnabled && (
              <button
                onClick={() => {
                  setSelectedSeasonForSearch({ seasonNumber: 0, name: "Complete Series" });
                  setSeasonPackSearchOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/30 text-orange-300 hover:from-orange-500/20 hover:to-amber-500/20 hover:border-orange-500/50 transition-all text-sm font-medium"
              >
                <Package className="h-4 w-4" />
                Search for Series Packs (Complete/Multi-Season)
              </button>
            )}

            {/* Seasons List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-pink-400 to-rose-400"></span>
                  Select Episodes
                </h4>
                {totalSelected > 0 && (
                  <span className="text-xs font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/20">
                    {totalSelected} episode{totalSelected !== 1 ? 's' : ''} selected
                  </span>
                )}
              </div>
            </div>
            
            <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1 -mr-1">
              {seasons.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <Tv className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No seasons available
                </div>
              ) : (
                seasons.map((season) => {
                  const isExpanded = expandedSeason === season.season_number;
                  const isLoadingEps = loadingEpisodes.has(season.season_number);
                  const episodes = seasonEpisodes[season.season_number] || [];
                  const checkedCount = getCheckedCount(season.season_number);
                  const selectableCount = episodes.filter(e => !(e.available || e.requested || e.downloading)).length;
                  const allChecked = selectableCount > 0 && checkedCount === selectableCount;
                  const availableCount = episodes.filter(e => e.available).length;
                  const isSeasonAvailable = episodes.length > 0 && availableCount === episodes.length;
                  const isSeasonPartial = availableCount > 0 && availableCount < episodes.length;

                  return (
                    <div 
                      key={season.season_number} 
                      className={`rounded-xl border overflow-hidden transition-all duration-200 ${
                        isExpanded 
                          ? 'border-purple-500/40 bg-gradient-to-b from-purple-500/5 to-transparent shadow-lg shadow-purple-500/5' 
                          : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                      }`}
                    >
                      {/* Season Header */}
                      <div 
                        className="w-full flex items-center gap-3 p-3 cursor-pointer"
                        onClick={() => toggleSeason(season.season_number)}
                      >
                        {/* Season Poster Thumbnail */}
                        <div className="w-12 h-[72px] rounded-lg overflow-hidden bg-gray-800 flex-shrink-0 relative ring-1 ring-white/10 shadow-md">
                          {season.poster_path ? (
                            <Image
                              src={`https://image.tmdb.org/t/p/w92${season.poster_path}`}
                              alt=""
                              fill
                              sizes="48px"
                              loading="lazy"
                              unoptimized
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                              <Tv className="h-5 w-5 text-gray-600" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 text-left min-w-0">
                          <div className="font-semibold text-white text-sm truncate">
                            {season.name || `Season ${season.season_number}`}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {season.episode_count} episode{season.episode_count !== 1 ? 's' : ''}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {checkedCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-purple-300 font-medium bg-purple-500/15 px-1.5 py-0.5 rounded-full border border-purple-500/20">
                                <Check className="w-2.5 h-2.5" />
                                {checkedCount} selected
                              </span>
                            )}
                            {isSeasonAvailable && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-300 font-medium bg-emerald-500/15 px-1.5 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle className="w-2.5 h-2.5" />
                                Available
                              </span>
                            )}
                            {!isSeasonAvailable && isSeasonPartial && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 font-medium bg-amber-500/15 px-1.5 py-0.5 rounded-full border border-amber-500/20">
                                <Info className="w-2.5 h-2.5" />
                                Partial
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSeasonSelection(season.season_number);
                          }}
                          disabled={isSubmitting || isLoadingEps}
                          className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 disabled:opacity-50 ${
                            allChecked
                              ? "border-purple-500/50 bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-200 shadow-sm"
                              : "border-white/15 bg-white/5 text-gray-300 hover:text-white hover:border-white/30 hover:bg-white/10"
                          }`}
                        >
                          {isLoadingEps ? (
                            <span className="flex items-center gap-1.5">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Loading
                            </span>
                          ) : allChecked ? (
                            <span className="flex items-center gap-1.5">
                              <Check className="w-3 h-3" />
                              Selected
                            </span>
                          ) : (
                            "Select All"
                          )}
                        </button>
                        <div
                          className={`rounded-lg border border-white/10 bg-white/5 p-1.5 text-gray-400 transition-transform duration-200 ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </div>
                      </div>

                      {/* Episodes List */}
                      {isExpanded && (
                        <div className="border-t border-white/5 bg-gradient-to-b from-black/30 to-transparent">
                          {isLoadingEps ? (
                            <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
                              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                              <span className="text-sm">Loading episodes...</span>
                            </div>
                          ) : episodes.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 text-sm">No episodes found</div>
                          ) : (
                            <div className="p-3">
                              {/* Episode Grid */}
                              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                                {episodes.map((episode) => {
                                  const isChecked = checkedEpisodes[season.season_number]?.has(episode.episode_number);
                                  const isAvailable = episode.available ?? false;
                                  const isRequested = episode.requested ?? false;
                                  const isDownloading = episode.downloading ?? episode.requestStatus === "downloading";
                                  const isDisabled = isAvailable || isRequested || isDownloading;
                                  const isCheckedForUi = Boolean(isChecked || isAvailable);

                                  return (
                                    <div
                                      key={episode.episode_number}
                                      onClick={() => !isDisabled && toggleEpisode(season.season_number, episode.episode_number, episode)}
                                      className={`flex items-center gap-3 p-2.5 rounded-lg transition-all duration-150 cursor-pointer ${
                                        isDisabled 
                                          ? 'opacity-50 cursor-not-allowed bg-white/[0.02]' 
                                          : isChecked 
                                            ? 'bg-gradient-to-r from-purple-500/15 to-pink-500/10 border border-purple-500/30' 
                                            : 'hover:bg-white/5 border border-transparent'
                                      } group`}
                                    >
                                      {/* Checkbox */}
                                      <div className={`w-5 h-5 rounded-md flex items-center justify-center transition-all duration-150 flex-shrink-0 ${
                                        isDisabled 
                                          ? 'bg-gray-700/50 border border-gray-600/50' 
                                          : isChecked 
                                            ? 'bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/25' 
                                            : 'border-2 border-gray-600 group-hover:border-gray-500'
                                      }`}>
                                        {(isCheckedForUi || isDisabled) && <Check className="h-3 w-3 text-white" />}
                                      </div>

                                      {/* Episode Info */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                          <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                                            isChecked 
                                              ? 'bg-purple-500/20 text-purple-300' 
                                              : 'bg-white/10 text-gray-300'
                                          }`}>
                                            E{String(episode.episode_number).padStart(2, '0')}
                                          </span>
                                          <span className="text-sm text-white truncate font-medium">
                                            {episode.name || "Untitled"}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                          {isAvailable && (
                                            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                                              <CheckCircle className="h-3 w-3" />
                                              Available
                                            </span>
                                          )}
                                          {isRequested && !isAvailable && !isDownloading && (
                                            <span className="inline-flex items-center gap-1 text-[10px] text-blue-400 font-medium">
                                              <Info className="h-3 w-3" />
                                              Requested
                                            </span>
                                          )}
                                          {isDownloading && (
                                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                              Downloading
                                            </span>
                                          )}
                                          {!isAvailable && !isRequested && !isDownloading && episode.air_date && (
                                            <span className="text-[10px] text-gray-500">
                                              {formatDate(episode.air_date)}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Search Button */}
                                      {isAdmin && prowlarrEnabled && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedEpisodeForSearch({
                                              seasonNumber: season.season_number,
                                              episodeNumber: episode.episode_number,
                                              name: episode.name || "Untitled",
                                              air_date: episode.air_date || null
                                            });
                                            setEpisodeSearchOpen(true);
                                          }}
                                          title="Search releases"
                                          className="flex-shrink-0 p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                          <SearchIcon className="h-4 w-4" />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Warning if blocked */}
            {requestsBlocked && (
              <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-orange-500/10 px-4 py-3 text-sm text-amber-100 backdrop-blur-sm">
                <div className="flex items-start gap-2">
                  <span className="text-amber-400 text-lg">⚠️</span>
                  <span>{blockedMessage}</span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm"
              >
                Cancel
              </button>
              <button
                onClick={requestSelectedEpisodes}
                disabled={isSubmitting || requestsBlocked || totalSelected === 0}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg backdrop-blur-sm ${
                  submitState === "success"
                    ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                    : submitState === "error"
                    ? "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700"
                    : "bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700"
                }`}
              >
                {submitState === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitState === "success" && <Check className="h-5 w-5" />}
                {submitState === "error" && <X className="h-5 w-5" />}
                <span>
                  {submitState === "loading"
                    ? "Requesting..."
                    : submitState === "success"
                    ? "Success!"
                    : submitState === "error"
                    ? "Failed"
                    : totalSelected > 0
                    ? `Request ${totalSelected} Episode${totalSelected !== 1 ? 's' : ''}`
                    : "Select Episodes"}
                </span>
              </button>
            </div>
          </div>
        )}
      </Modal>
      {selectedEpisodeForSearch ? (
        <ReleaseSearchModal
          open={episodeSearchOpen}
          onClose={() => {
            setEpisodeSearchOpen(false);
            setSelectedEpisodeForSearch(null);
          }}
          mediaType="tv"
          mediaId={serviceItemId}
          tmdbId={tmdbId}
          tvdbId={tvdbId ?? null}
          title={`${title || "Series"} · S${String(selectedEpisodeForSearch.seasonNumber).padStart(2, "0")}E${String(selectedEpisodeForSearch.episodeNumber).padStart(2, "0")} · ${selectedEpisodeForSearch.name}`}
          searchTitle={title || "Series"}
          year={year ?? null}
          posterUrl={posterUrl ?? null}
          backdropUrl={backdropUrl ?? null}
          preferProwlarr={prowlarrEnabled}
          seasonNumber={selectedEpisodeForSearch.seasonNumber}
          episodeNumber={selectedEpisodeForSearch.episodeNumber}
          airDate={selectedEpisodeForSearch.air_date}
        />
      ) : null}
      {selectedSeasonForSearch ? (
        <ReleaseSearchModal
          open={seasonPackSearchOpen}
          onClose={() => {
            setSeasonPackSearchOpen(false);
            setSelectedSeasonForSearch(null);
          }}
          mediaType="tv"
          mediaId={serviceItemId}
          tmdbId={tmdbId}
          tvdbId={tvdbId ?? null}
          title={`${title || "Series"} · Complete/Multi-Season Packs`}
          searchTitle={title || "Series"}
          year={year ?? null}
          posterUrl={posterUrl ?? null}
          backdropUrl={backdropUrl ?? null}
          preferProwlarr={prowlarrEnabled}
          seasonNumber={selectedSeasonForSearch.seasonNumber}
        />
      ) : null}
    </>
  );
}
