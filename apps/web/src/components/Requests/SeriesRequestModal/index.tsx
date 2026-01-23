"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Modal } from "@/components/Common/Modal";
import { readJson } from "@/lib/fetch-utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { logger } from "@/lib/logger";
import { Check, X, Loader2, ChevronDown, ChevronUp, Tv, CheckCircle, Info, Star } from "lucide-react";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

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
};

type Season = {
  season_number: number;
  episode_count: number;
  name: string;
  poster_path: string | null;
};

export function SeriesRequestModal({
  open,
  onClose,
  tmdbId,
  qualityProfiles,
  defaultQualityProfileId,
  requestsBlocked = false,
  title = "",
  posterUrl,
  backdropUrl,
  onRequestPlaced,
  isLoading = false
}: {
  open: boolean;
  onClose: () => void;
  tmdbId: number;
  qualityProfiles: QualityProfile[];
  defaultQualityProfileId: number;
  requestsBlocked?: boolean;
  title?: string;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  onRequestPlaced?: () => void;
  isLoading?: boolean;
}) {
  const [selectedQualityProfileId, setSelectedQualityProfileId] = useState<number>(defaultQualityProfileId);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const router = useRouter();
  const toast = useToast();

  // Season/episode state
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loadingSeasons, setLoadingSeasons] = useState(true);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState<Record<number, Episode[]>>({});
  const [loadingEpisodes, setLoadingEpisodes] = useState<Set<number>>(new Set());
  const [checkedEpisodes, setCheckedEpisodes] = useState<Record<number, Set<number>>>({});

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

          // Pre-load all season episodes in parallel for immediate availability display
          const episodePromises = allSeasons.map(async (season: Season) => {
            try {
              const episodeRes = await fetch(
                `/api/v1/tmdb/tv/${tmdbId}/season/${season.season_number}/enhanced`,
                { signal: abortController.signal }
              );
              if (episodeRes.ok) {
                const episodeData = await episodeRes.json();
                return { seasonNumber: season.season_number, episodes: episodeData.episodes || [] };
              }
            } catch (err: any) {
              if (err.name === 'AbortError') throw err;
              // Ignore errors for individual seasons
            }
            return null;
          });

          const results = await Promise.all(episodePromises);

          if (abortController.signal.aborted) return;

          const newSeasonEpisodes: Record<number, Episode[]> = {};
          for (const result of results) {
            if (result) {
              newSeasonEpisodes[result.seasonNumber] = result.episodes;
            }
          }
          setSeasonEpisodes(newSeasonEpisodes);
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
    }
  }, [open]);

  async function loadSeasonEpisodes(seasonNumber: number) {
    if (seasonEpisodes[seasonNumber]) return;

    setLoadingEpisodes(prev => new Set(prev).add(seasonNumber));
    try {
      const res = await fetch(`/api/v1/tmdb/tv/${tmdbId}/season/${seasonNumber}/enhanced`);
      if (res.ok) {
        const data = await res.json();
        setSeasonEpisodes(prev => ({ ...prev, [seasonNumber]: data.episodes || [] }));
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
    if (episode?.available || episode?.requested) return;

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

  function selectAllInSeason(seasonNumber: number) {
    const episodes = seasonEpisodes[seasonNumber] || [];
    const selectable = episodes.filter(e => !(e.available || e.requested)).map(e => e.episode_number);
    const currentChecked = checkedEpisodes[seasonNumber] || new Set();
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
      // Group episodes by season and submit requests
      const seasonNumbers = Object.keys(checkedEpisodes).map(Number).filter(s => checkedEpisodes[s]?.size > 0);
      let successCount = 0;
      let errorMessage = "";

      for (const seasonNumber of seasonNumbers) {
        const episodeNumbers = Array.from(checkedEpisodes[seasonNumber] || []).sort((a, b) => a - b);
        if (episodeNumbers.length === 0) continue;

        const res = await csrfFetch("/api/v1/request/episodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tmdbTvId: tmdbId,
            seasonNumber,
            episodeNumbers,
            qualityProfileId: selectedQualityProfileId
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
          if (res.status === 409 && j?.error === "already_requested") {
            // Some episodes already requested, continue with others
            continue;
          }
          errorMessage = j?.error || j?.message || "Request failed";
        } else {
          successCount += j?.count || episodeNumbers.length;
        }
      }

      if (successCount > 0) {
        toast.success(`Successfully requested ${successCount} episode${successCount !== 1 ? 's' : ''}!`, { timeoutMs: 3000 });
        setSubmitState("success");
        router.refresh();
        if (onRequestPlaced) onRequestPlaced();
        setTimeout(() => {
          setCheckedEpisodes({});
          onClose();
        }, 1500);
      } else if (errorMessage) {
        throw new Error(errorMessage);
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
          <div className="space-y-4">
            {/* Quality Profile Selection */}
            {qualityProfiles.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
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

            {/* Seasons List */}
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {seasons.length === 0 ? (
                <div className="text-center py-6 text-gray-400">No seasons available</div>
              ) : (
                seasons.map((season) => {
                  const isExpanded = expandedSeason === season.season_number;
                  const isLoadingEps = loadingEpisodes.has(season.season_number);
                  const episodes = seasonEpisodes[season.season_number] || [];
                  const checkedCount = getCheckedCount(season.season_number);
                  const selectableCount = episodes.filter(e => !(e.available || e.requested)).length;
                  const allChecked = selectableCount > 0 && checkedCount === selectableCount;
                  const availableCount = episodes.filter(e => e.available).length;
                  const isSeasonAvailable = episodes.length > 0 && availableCount === episodes.length;
                  const isSeasonPartial = availableCount > 0 && availableCount < episodes.length;

                  return (
                    <div key={season.season_number} className="rounded-lg border border-white/10 bg-white/5 overflow-hidden">
                      {/* Season Header */}
                      <button
                        onClick={() => toggleSeason(season.season_number)}
                        className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors"
                      >
                        {/* Season Poster Thumbnail */}
                        <div className="w-10 h-14 rounded overflow-hidden bg-gray-800 flex-shrink-0 relative">
                          {season.poster_path ? (
                            <Image
                              src={`https://image.tmdb.org/t/p/w92${season.poster_path}`}
                              alt=""
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Tv className="h-4 w-4 text-gray-600" />
                            </div>
                          )}
                        </div>

                        <div className="flex-1 text-left min-w-0">
                          <div className="font-semibold text-white text-sm truncate">
                            {season.name || `Season ${season.season_number}`}
                          </div>
                          <div className="text-xs text-gray-400 flex items-center gap-2">
                            <span>{season.episode_count} episodes</span>
                            {checkedCount > 0 && (
                              <span className="text-purple-400 font-medium bg-purple-400/10 px-1.5 py-0.5 rounded">
                                {checkedCount} selected
                              </span>
                            )}
                            {isSeasonAvailable && (
                              <span className="text-emerald-300 font-medium bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Available
                              </span>
                            )}
                            {!isSeasonAvailable && isSeasonPartial && (
                              <span className="text-purple-200 font-medium bg-purple-500/10 px-1.5 py-0.5 rounded">
                                Partially Available
                              </span>
                            )}
                          </div>
                        </div>

                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        )}
                      </button>

                      {/* Episodes List */}
                      {isExpanded && (
                        <div className="border-t border-white/10 bg-black/20">
                          {isLoadingEps ? (
                            <div className="flex items-center justify-center py-6 text-gray-400 gap-2">
                              <div className="h-4 w-4 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                              <span className="text-xs">Loading episodes...</span>
                            </div>
                          ) : episodes.length === 0 ? (
                            <div className="text-center py-6 text-gray-400 text-xs">No episodes found</div>
                          ) : (
                            <div className="p-3 space-y-2">
                              {/* Select All */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectAllInSeason(season.season_number);
                                }}
                                className="flex items-center gap-2 text-xs text-gray-300 hover:text-white transition-colors mb-2"
                              >
                                <div className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${
                                  allChecked ? 'bg-purple-500 border-purple-500' : 'border-gray-500'
                                }`}>
                                  {allChecked && <Check className="h-3 w-3 text-white" />}
                                </div>
                                <span>Select all available</span>
                              </button>

                              {/* Episode List */}
                              <div className="space-y-1 max-h-48 overflow-y-auto">
                                {episodes.map((episode) => {
                                  const isChecked = checkedEpisodes[season.season_number]?.has(episode.episode_number);
                                  const isAvailable = episode.available ?? false;
                                  const isRequested = episode.requested ?? false;
                                  const isDisabled = isAvailable || isRequested;
                                  const isCheckedForUi = Boolean(isChecked || isAvailable);

                                  return (
                                    <label
                                      key={episode.episode_number}
                                      className={`flex items-center gap-2 p-2 rounded transition-colors ${
                                        isDisabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-white/5'
                                      } ${isChecked ? 'bg-purple-500/10' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={isCheckedForUi}
                                        onChange={() => toggleEpisode(season.season_number, episode.episode_number, episode)}
                                        disabled={isDisabled}
                                        className="hidden"
                                      />
                                      <div className={`h-4 w-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
                                        isDisabled ? 'bg-gray-700 border-gray-600' :
                                        isChecked ? 'bg-purple-500 border-purple-500' : 'border-gray-500'
                                      }`}>
                                        {(isCheckedForUi || isDisabled) && <Check className="h-3 w-3 text-white" />}
                                      </div>

                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-xs font-medium text-white">
                                            E{episode.episode_number}
                                          </span>
                                          <span className="text-xs text-gray-400 truncate">
                                            {episode.name || "Untitled"}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          {isAvailable && (
                                            <span className="inline-flex items-center gap-0.5 text-[10px] text-indigo-300">
                                              <CheckCircle className="h-2.5 w-2.5" />
                                              Available
                                            </span>
                                          )}
                                          {isRequested && (
                                            <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-300">
                                              <Info className="h-2.5 w-2.5" />
                                              Requested
                                            </span>
                                          )}
                                          {!isAvailable && !isRequested && episode.air_date && (
                                            <span className="text-[10px] text-gray-500">
                                              {formatDate(episode.air_date)}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </label>
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
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                {blockedMessage}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleClose}
                disabled={isSubmitting}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={requestSelectedEpisodes}
                disabled={isSubmitting || requestsBlocked || totalSelected === 0}
                className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                  submitState === "success"
                    ? "bg-green-600 hover:bg-green-700"
                    : submitState === "error"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-purple-600 hover:bg-purple-700"
                }`}
              >
                {submitState === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitState === "success" && <Check className="h-4 w-4" />}
                {submitState === "error" && <X className="h-4 w-4" />}
                <span>
                  {submitState === "loading"
                    ? "Requesting..."
                    : submitState === "success"
                    ? "Success"
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
    </>
  );
}
