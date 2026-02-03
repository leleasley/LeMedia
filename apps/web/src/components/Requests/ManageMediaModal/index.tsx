"use client";

import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { ExternalLink, Trash2, Eraser, Eye, Check, X, Search } from "lucide-react";
import { ReleaseSearchModal } from "@/components/Media/ReleaseSearchModal";
import { Modal } from "@/components/Common/Modal";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";

type SeasonSummary = {
  season_number: number;
  episode_count: number;
  name: string;
};

type EpisodeSummary = {
  episode_number: number;
  name: string;
  air_date: string | null;
};

export function ManageMediaModal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  year?: string | number | null;
  mediaType: "movie" | "tv";
  tmdbId: number;
  tvdbId?: number | null;
  serviceItemId?: number | null;
  serviceSlug?: string | null;
  serviceBaseUrl?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  prowlarrEnabled?: boolean;
}) {
  const {
    open,
    onClose,
    title,
    year,
    mediaType,
    tmdbId,
    tvdbId,
    serviceItemId,
    serviceSlug,
    serviceBaseUrl,
    posterUrl,
    backdropUrl,
    prowlarrEnabled = false
  } = props;
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [episodeSearchOpen, setEpisodeSearchOpen] = useState(false);
  const [currentInfo, setCurrentInfo] = useState<{
    quality?: string | null;
    sizeBytes?: number | null;
    episodeFileCount?: number | null;
    monitored?: boolean | null;
    seriesType?: string | null;
  } | null>(null);
  const [currentInfoLoading, setCurrentInfoLoading] = useState(false);
  const [currentInfoError, setCurrentInfoError] = useState<string | null>(null);
  const [monitoringOption, setMonitoringOption] = useState<string>("all");
  const [monitoringSaving, setMonitoringSaving] = useState(false);
  const [monitoringStatus, setMonitoringStatus] = useState<"idle" | "success" | "error">("idle");
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [seasonEpisodes, setSeasonEpisodes] = useState<Record<number, EpisodeSummary[]>>({});
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const monitoringOptions = [
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

  useEffect(() => {
    if (!open) setRawOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open) setEpisodeSearchOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open || !serviceItemId) {
      setCurrentInfo(null);
      setCurrentInfoError(null);
      setCurrentInfoLoading(false);
      return;
    }
    let cancelled = false;
    setCurrentInfoLoading(true);
    setCurrentInfoError(null);
    fetch(`/api/v1/admin/media/info?mediaType=${mediaType}&id=${serviceItemId}`, { credentials: "include" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Unable to load current version");
        return body;
      })
      .then((data) => {
        if (cancelled) return;
        setCurrentInfo({
          quality: data?.quality ?? null,
          sizeBytes: data?.sizeBytes ?? null,
          episodeFileCount: data?.episodeFileCount ?? null,
          monitored: typeof data?.monitored === "boolean" ? data.monitored : null,
          seriesType: typeof data?.seriesType === "string" ? data.seriesType : null
        });
        if (typeof data?.monitored === "boolean") {
          setMonitoringOption(data.monitored ? "all" : "none");
        }
      })
      .catch((err: any) => {
        if (cancelled) return;
        setCurrentInfoError(err?.message ?? "Unable to load current version");
      })
      .finally(() => {
        if (cancelled) return;
        setCurrentInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, mediaType, serviceItemId]);

  useEffect(() => {
    if (!open || mediaType !== "tv" || !tmdbId) {
      setSeasons([]);
      setSeasonEpisodes({});
      setSelectedSeason(null);
      setSelectedEpisode(null);
      return;
    }
    const controller = new AbortController();
    setSeasonsLoading(true);
    fetch(`/api/v1/tmdb/tv/${tmdbId}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load seasons");
        return res.json();
      })
      .then((data) => {
        const list: SeasonSummary[] = Array.isArray(data?.seasons)
          ? data.seasons.filter((s: SeasonSummary) => s.season_number > 0 || data.seasons.length === 1)
          : [];
        setSeasons(list);
        const defaultSeason = list[0]?.season_number ?? null;
        setSelectedSeason((prev) => prev ?? defaultSeason);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSeasons([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setSeasonsLoading(false);
      });
    return () => controller.abort();
  }, [open, mediaType, tmdbId]);

  useEffect(() => {
    if (!open || mediaType !== "tv" || !tmdbId || selectedSeason === null) {
      setSelectedEpisode(null);
      return;
    }
    if (seasonEpisodes[selectedSeason]) {
      const firstEpisode = seasonEpisodes[selectedSeason]?.[0]?.episode_number ?? null;
      setSelectedEpisode((prev) => prev ?? firstEpisode);
      return;
    }
    const controller = new AbortController();
    setEpisodesLoading(true);
    fetch(`/api/v1/tmdb/tv/${tmdbId}/season/${selectedSeason}/enhanced`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load episodes");
        return res.json();
      })
      .then((data) => {
        const episodes: EpisodeSummary[] = Array.isArray(data?.episodes) ? data.episodes : [];
        setSeasonEpisodes(prev => ({ ...prev, [selectedSeason]: episodes }));
        const firstEpisode = episodes?.[0]?.episode_number ?? null;
        setSelectedEpisode((prev) => prev ?? firstEpisode);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSeasonEpisodes(prev => ({ ...prev, [selectedSeason]: [] }));
          setSelectedEpisode(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setEpisodesLoading(false);
      });
    return () => controller.abort();
  }, [open, mediaType, tmdbId, selectedSeason, seasonEpisodes]);

  // Construct URL like Jellyseerr does: baseUrl/movie/titleSlug or baseUrl/series/titleSlug
  // If slug is not available, fall back to using the ID
  const openUrl = serviceBaseUrl && (serviceSlug || serviceItemId)
    ? `${serviceBaseUrl.replace(/\/+$/, "")}/${mediaType === "movie" ? "movie" : "series"}/${serviceSlug || serviceItemId}`
    : null;

  const runAction = async (action: "remove" | "clear") => {
    if (working) return;
    if (action === "remove") {
      if (!confirm(`Remove ${title} from ${mediaType === "movie" ? "Radarr" : "Sonarr"}? This will delete files.`)) {
        return;
      }
    } else if (!confirm(`Clear all data for ${title}?`)) {
      return;
    }
    setWorking(true);
    setError(null);
    try {
      const endpoint = mediaType === "movie" ? "/api/v1/admin/media/movie" : "/api/v1/admin/media/tv";
      const res = await csrfFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tmdbId, tvdbId, action })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Action failed");
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Action failed");
    } finally {
      setWorking(false);
    }
  };

  const updateMonitoring = async () => {
    if (monitoringSaving || !serviceItemId) return;
    setMonitoringSaving(true);
    setError(null);
    setMonitoringStatus("idle");
    try {
      const res = await csrfFetch("/api/v1/sonarr/series/monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ seriesId: serviceItemId, monitoringOption })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to update monitoring");
      setCurrentInfo(prev => (prev ? { ...prev, monitored: monitoringOption !== "none" } : prev));
      setMonitoringStatus("success");
      setTimeout(() => setMonitoringStatus("idle"), 1500);
    } catch (err: any) {
      setError(err?.message ?? "Failed to update monitoring");
      setMonitoringStatus("error");
    } finally {
      setMonitoringSaving(false);
    }
  };

  const formatBytes = (bytes?: number | null) => {
    if (!bytes || Number.isNaN(bytes)) return "-";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
  };

  const formatSeasonLabel = (season: SeasonSummary) => `Season ${season.season_number}`;

  const formatEpisodeLabel = (episode: EpisodeSummary) => {
    const episodeNumber = String(episode.episode_number).padStart(2, "0");
    const airDate = episode.air_date ? ` • ${episode.air_date}` : "";
    return `E${episodeNumber} • ${episode.name || "Episode"}${airDate}`;
  };

  const selectedEpisodeData = selectedSeason !== null && selectedEpisode !== null
    ? (seasonEpisodes[selectedSeason] || []).find(ep => ep.episode_number === selectedEpisode) ?? null
    : null;

  const episodeSearchTitle = selectedEpisodeData && selectedSeason !== null && selectedEpisode !== null
    ? `${title} · S${String(selectedSeason).padStart(2, "0")}E${String(selectedEpisode).padStart(2, "0")} · ${selectedEpisodeData.name || "Episode"}`
    : title;

  if (!open) return null;

  return (
    <>
      <Modal
        open={open}
        title={`Manage ${mediaType === "movie" ? "Movie" : "TV Show"}`}
        onClose={onClose}
        backgroundImage={backdropUrl ?? undefined}
      >
        <div className="text-sm text-white/80 mb-4">{title}</div>
        <div className="space-y-6">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Media</div>
            <a
              href={openUrl ?? "#"}
              target="_blank"
              rel="noreferrer"
              className={`flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-white ${openUrl ? "hover:bg-white/5" : "cursor-not-allowed opacity-50"}`}
            >
              <ExternalLink className="h-4 w-4" />
              Open in {mediaType === "movie" ? "Radarr" : "Sonarr"}
            </a>
            {serviceItemId ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80">
                <div className="text-[10px] uppercase tracking-wider text-white/50">Current Version</div>
                {currentInfoLoading ? (
                  <div className="mt-1 text-white/60">Loading...</div>
                ) : currentInfoError ? (
                  <div className="mt-1 text-red-300">Error: {currentInfoError}</div>
                ) : (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{currentInfo?.quality || "Unknown"}</span>
                    {currentInfo?.sizeBytes ? (
                      <span className="text-white/50">| {formatBytes(currentInfo.sizeBytes)}</span>
                    ) : null}
                    {mediaType === "tv" && typeof currentInfo?.episodeFileCount === "number" ? (
                      <span className="text-white/50">| Episodes: {currentInfo.episodeFileCount}</span>
                    ) : null}
                    {mediaType === "tv" && typeof currentInfo?.monitored === "boolean" ? (
                      <span className="text-white/50">| Monitored: {currentInfo.monitored ? "Yes" : "No"}</span>
                    ) : null}
                    {mediaType === "tv" && currentInfo?.seriesType ? (
                      <span className="text-white/50">| Release Type: {currentInfo.seriesType}</span>
                    ) : null}
                  </div>
                )}
              </div>
            ) : null}
            {mediaType === "tv" && serviceItemId ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2">Monitoring</div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <AdaptiveSelect
                      value={monitoringOption}
                      onValueChange={setMonitoringOption}
                      disabled={monitoringSaving}
                      options={monitoringOptions}
                      placeholder="Select monitoring option"
                      className="w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={updateMonitoring}
                    disabled={monitoringSaving}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${
                      monitoringStatus === "success"
                        ? "bg-emerald-600 hover:bg-emerald-500"
                        : monitoringStatus === "error"
                        ? "bg-red-600 hover:bg-red-500"
                        : "bg-indigo-600 hover:bg-indigo-500"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      {monitoringSaving ? "Saving..." : "Save Monitoring"}
                      {monitoringStatus === "success" ? <Check className="h-4 w-4" /> : null}
                      {monitoringStatus === "error" ? <X className="h-4 w-4" /> : null}
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
            {mediaType === "tv" ? (
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                <div className="text-[10px] uppercase tracking-wider text-white/50 mb-2">Episode Interactive Search</div>
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <AdaptiveSelect
                      value={selectedSeason !== null ? String(selectedSeason) : ""}
                      onValueChange={(value) => setSelectedSeason(Number(value))}
                      disabled={seasonsLoading || seasons.length === 0}
                      options={seasons.map(season => ({ value: String(season.season_number), label: formatSeasonLabel(season) }))}
                      placeholder={seasonsLoading ? "Loading seasons..." : "Select season"}
                      className="w-full"
                    />
                    <AdaptiveSelect
                      value={selectedEpisode !== null ? String(selectedEpisode) : ""}
                      onValueChange={(value) => setSelectedEpisode(Number(value))}
                      disabled={episodesLoading || selectedSeason === null}
                      options={(selectedSeason !== null ? (seasonEpisodes[selectedSeason] || []) : []).map(ep => ({
                        value: String(ep.episode_number),
                        label: formatEpisodeLabel(ep)
                      }))}
                      placeholder={episodesLoading ? "Loading episodes..." : "Select episode"}
                      className="w-full"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setEpisodeSearchOpen(true)}
                    disabled={!selectedEpisodeData || !prowlarrEnabled}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Search className="h-4 w-4" />
                    {!prowlarrEnabled
                      ? "Set up Prowlarr in services"
                      : selectedEpisodeData
                      ? "Search Episode Releases"
                      : "Select an episode"}
                  </button>
                </div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => runAction("remove")}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
              disabled={working}
            >
              <Trash2 className="h-4 w-4" />
              Remove from {mediaType === "movie" ? "Radarr" : "Sonarr"}
            </button>
            <p className="text-xs text-white/50">
              This will irreversibly remove this {mediaType === "movie" ? "movie" : "show"} from {mediaType === "movie" ? "Radarr" : "Sonarr"}, including all files.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-semibold text-white">Advanced</div>
            <button
              type="button"
              onClick={() => {
                if (prowlarrEnabled) setRawOpen(true);
              }}
              disabled={!prowlarrEnabled}
              title={prowlarrEnabled ? "View Raw releases" : "Set up Prowlarr in services"}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Eye className="h-4 w-4" />
              {prowlarrEnabled ? "View Raw Releases" : "Set up Prowlarr in services"}
            </button>
            <button
              type="button"
              onClick={() => runAction("clear")}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600"
              disabled={working}
            >
              <Eraser className="h-4 w-4" />
              Clear Data
            </button>
            <p className="text-xs text-white/50">
              This will remove all data for this {mediaType === "movie" ? "movie" : "show"}, including any requests.
            </p>
          </div>

          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          ) : null}
        </div>
      </Modal>
      {prowlarrEnabled ? (
        <ReleaseSearchModal
          open={rawOpen}
          onClose={() => setRawOpen(false)}
          mediaType={mediaType}
          mediaId={serviceItemId ?? null}
          tmdbId={tmdbId}
          tvdbId={tvdbId ?? null}
          title={title}
          year={year ?? null}
          posterUrl={posterUrl ?? null}
          backdropUrl={backdropUrl ?? null}
          preferProwlarr={prowlarrEnabled}
        />
      ) : null}
      {mediaType === "tv" ? (
        <ReleaseSearchModal
          open={episodeSearchOpen}
          onClose={() => setEpisodeSearchOpen(false)}
          mediaType="tv"
          mediaId={serviceItemId ?? null}
          tmdbId={tmdbId}
          tvdbId={tvdbId ?? null}
          title={episodeSearchTitle}
          searchTitle={title}
          year={year ?? null}
          posterUrl={posterUrl ?? null}
          backdropUrl={backdropUrl ?? null}
          preferProwlarr={prowlarrEnabled}
          seasonNumber={selectedSeason ?? undefined}
          episodeNumber={selectedEpisode ?? undefined}
          airDate={selectedEpisodeData?.air_date ?? null}
          seriesType={currentInfo?.seriesType ?? null}
        />
      ) : null}
    </>
  );
}
