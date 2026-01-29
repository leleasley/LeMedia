"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { ExternalLink, Trash2, Eraser, Eye } from "lucide-react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { ReleaseSearchModal } from "@/components/Media/ReleaseSearchModal";

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
  const [currentInfo, setCurrentInfo] = useState<{
    quality?: string | null;
    sizeBytes?: number | null;
    episodeFileCount?: number | null;
  } | null>(null);
  const [currentInfoLoading, setCurrentInfoLoading] = useState(false);
  const [currentInfoError, setCurrentInfoError] = useState<string | null>(null);

  // Lock body scroll when modal is open
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) setRawOpen(false);
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
          episodeFileCount: data?.episodeFileCount ?? null
        });
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

  const formatBytes = (bytes?: number | null) => {
    if (!bytes || Number.isNaN(bytes)) return "-";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    const value = bytes / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
  };

  if (!open) return null;

  const content = (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#1a2234] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <div className="text-xl font-semibold text-violet-300">Manage {mediaType === "movie" ? "Movie" : "TV Show"}</div>
            <div className="text-sm text-white/80">{title}</div>
          </div>
          <button
            type="button"
            className="text-white/60 hover:text-white"
            onClick={onClose}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
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
                  </div>
                )}
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
      </div>
    </div>
  );

  if (typeof document === "undefined") return content;
  return createPortal(
    <>
      {content}
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
    </>,
    document.body
  );
}
