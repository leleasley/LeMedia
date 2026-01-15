"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { ExternalLink, Trash2, Eraser } from "lucide-react";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

export function ManageMediaModal(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  tvdbId?: number | null;
  serviceItemId?: number | null;
  serviceSlug?: string | null;
  serviceBaseUrl?: string | null;
}) {
  const { open, onClose, title, mediaType, tmdbId, tvdbId, serviceItemId, serviceSlug, serviceBaseUrl } = props;
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lock body scroll when modal is open
  useLockBodyScroll(open);

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
  return createPortal(content, document.body);
}
