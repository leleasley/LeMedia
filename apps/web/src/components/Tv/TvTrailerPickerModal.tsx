"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Common/Modal";
import useSWR from "swr";

type SeasonTrailerItem = {
  seasonNumber: number;
  name: string;
  trailerUrl: string;
};

type TvTrailerPickerModalProps = {
  open: boolean;
  onClose: () => void;
  tvId: number;
  title: string;
  seriesTrailerUrl?: string | null;
  preferredMode?: "series" | "latest-season" | "best-available";
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error("Failed to load trailers");
  }
  return response.json();
};

function parseYouTubeId(url: string): string | null {
  try {
    const value = new URL(url);
    const host = value.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = value.pathname.replace(/^\/+/, "").split("/")[0];
      return id || null;
    }
    if (host.endsWith("youtube.com")) {
      const videoId = value.searchParams.get("v");
      if (videoId) return videoId;
      const parts = value.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1]) return parts[1];
      if (parts[0] === "shorts" && parts[1]) return parts[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function TvTrailerPickerModal({ open, onClose, tvId, title, seriesTrailerUrl, preferredMode = "series" }: TvTrailerPickerModalProps) {
  const [manualSelection, setManualSelection] = useState<{ key: string; url: string | null }>({
    key: "",
    url: null,
  });
  const { data, error, isLoading } = useSWR(
    open ? `/api/v1/tv/${tvId}/season-trailers?includeFallbacks=1` : null,
    fetcher
  );

  const seasonTrailers = useMemo(
    () => (Array.isArray(data?.seasons) ? data.seasons : []),
    [data]
  );
  const resolvedSeriesTrailerUrl = data?.seriesTrailerUrl ?? seriesTrailerUrl ?? null;

  const trailerOptions = useMemo(() => {
    const options: Array<{ label: string; url: string }> = [];
    if (resolvedSeriesTrailerUrl) {
      options.push({ label: "Series Trailer", url: resolvedSeriesTrailerUrl });
    }
    for (const season of seasonTrailers) {
      options.push({ label: season.name || `Season ${season.seasonNumber}`, url: season.trailerUrl });
    }
    return options;
  }, [resolvedSeriesTrailerUrl, seasonTrailers]);

  const preferredOption = useMemo(() => {
    if (!open || trailerOptions.length === 0) return null;

    const latestSeasonOption = [...trailerOptions]
      .reverse()
      .find((option) => option.label !== "Series Trailer");

    if (preferredMode === "latest-season") {
      return latestSeasonOption ?? trailerOptions[0];
    }

    if (preferredMode === "best-available") {
      return latestSeasonOption ?? trailerOptions[trailerOptions.length - 1] ?? trailerOptions[0];
    }

    return trailerOptions.find((option) => option.label === "Series Trailer") ?? trailerOptions[0];
  }, [open, preferredMode, trailerOptions]);

  const selectionKey = useMemo(
    () => `${tvId}:${preferredMode}:${trailerOptions.map((option) => option.url).join("|")}`,
    [preferredMode, trailerOptions, tvId]
  );
  const selectedTrailerUrl =
    manualSelection.key === selectionKey && manualSelection.url
      ? manualSelection.url
      : preferredOption?.url ?? null;
  const selectedTrailerLabel =
    trailerOptions.find((option) => option.url === selectedTrailerUrl)?.label ?? preferredOption?.label ?? null;

  const selectedTrailerEmbedUrl = useMemo(() => {
    if (!selectedTrailerUrl) return null;
    const youtubeId = parseYouTubeId(selectedTrailerUrl);
    if (!youtubeId) return null;
    return `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`;
  }, [selectedTrailerUrl]);

  return (
    <Modal open={open} onClose={onClose} title="Choose a Trailer" forceCenter>
      <div className="space-y-4">
        <p className="text-sm leading-6 text-gray-300">
          Choose which trailer you want to watch for {title}.
        </p>
        <p className="text-xs leading-5 text-gray-400">
          We try TMDB first, then a best-effort YouTube search. Not all trailers can be grabbed automatically.
        </p>

        {isLoading ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
            Loading trailers...
          </div>
        ) : null}

        {error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Unable to load season trailers right now.
          </div>
        ) : null}

        {!isLoading && !error && trailerOptions.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-gray-300">
            No trailers are currently available for this series or its seasons.
          </div>
        ) : null}

        {trailerOptions.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {trailerOptions.map((option) => {
              const selected = selectedTrailerUrl === option.url;
              return (
                <button
                  key={`${option.label}-${option.url}`}
                  type="button"
                  onClick={() => setManualSelection({ key: selectionKey, url: option.url })}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-colors ${
                    selected
                      ? "border-amber-400 bg-amber-500/15 text-white"
                      : "border-white/10 bg-white/5 text-gray-200 hover:border-white/20 hover:bg-white/10"
                  }`}
                >
                  <span className="block">{option.label}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {selectedTrailerEmbedUrl ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">
              {selectedTrailerLabel ?? "Trailer"}
            </div>
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe
                src={selectedTrailerEmbedUrl}
                title={selectedTrailerLabel ? `${selectedTrailerLabel} for ${title}` : `Trailer for ${title}`}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}