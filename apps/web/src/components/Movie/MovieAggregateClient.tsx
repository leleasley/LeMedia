"use client";

import useSWR from "swr";
import { CheckCircle } from "lucide-react";
import { MediaActionMenu } from "@/components/Media/MediaActionMenu";
import { MediaListButtons } from "@/components/Media/MediaListButtons";
import { MovieRequestPanel } from "@/components/Movie/MovieRequestPanel";
import { useTrackView } from "@/hooks/useTrackView";
import { ShareButton } from "@/components/Media/ShareButton";

type RadarrMovieSummary = {
  id: number | null;
  titleSlug: string | null;
  hasFile: boolean;
  monitored: boolean | null;
};

type MovieAggregate = {
  tmdbId: number;
  isAdmin: boolean;
  availableInLibrary: boolean;
  playUrl: string | null;
  request?: { id: string; status: string; createdAt: string } | null;
  manage?: {
    itemId: number | null;
    slug: string | null;
    baseUrl: string | null;
  };
  radarr?: {
    qualityProfiles: any[];
    radarrMovie: RadarrMovieSummary | null;
    radarrError: string | null;
    defaultQualityProfileId: number;
    requestsBlocked: boolean;
    prowlarrEnabled?: boolean;
  };
};

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return null;
  return res.json();
};

function useMovieAggregate(tmdbId: number, title?: string, prefetched?: MovieAggregate) {
  const params = new URLSearchParams();
  if (title) params.set("title", title);
  const query = params.toString();
  const key = `/api/v1/movie/${tmdbId}${query ? `?${query}` : ""}`;
  return useSWR<MovieAggregate>(key, fetcher, { revalidateOnFocus: false, fallbackData: prefetched ?? undefined });
}

export function MovieAvailabilityBadge({
  tmdbId,
  title,
  prefetched
}: {
  tmdbId: number;
  title?: string;
  prefetched?: MovieAggregate;
}) {
  const { data } = useMovieAggregate(tmdbId, title, prefetched);

  if (!data) return null;
  if (!data.availableInLibrary && !data.request?.status) return null;

  const requestStatus = data.request?.status ?? null;
  const requestLabel =
    requestStatus === "queued"
      ? "Queued"
      : requestStatus === "pending"
        ? "Pending"
        : requestStatus === "submitted"
          ? "Submitted"
          : null;
  const requestBadgeClasses =
    requestStatus === "submitted"
      ? "border-blue-500/50 bg-blue-500 text-blue-100"
      : requestStatus === "pending"
        ? "border-sky-500/50 bg-sky-500 text-sky-100"
        : "border-amber-500/50 bg-amber-500 text-amber-100";

  return (
    data.availableInLibrary ? (
      <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-500 px-3 text-xs font-semibold text-white shadow-sm">
        <CheckCircle className="h-4 w-4" />
        Available
      </div>
    ) : requestLabel ? (
      <div className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold text-white shadow-sm ${requestBadgeClasses}`}>
        <CheckCircle className="h-4 w-4" />
        {requestLabel}
      </div>
    ) : null
  );
}

export function MovieActionButtons({
  tmdbId,
  title,
  trailerUrl,
  backdropUrl,
  prefetched,
  posterUrl,
  year
}: {
  tmdbId: number;
  title: string;
  trailerUrl?: string | null;
  backdropUrl?: string | null;
  prefetched?: MovieAggregate;
  posterUrl?: string | null;
  year?: string | number | null;
}) {
  const { data, isLoading } = useMovieAggregate(tmdbId, title, prefetched);
  const available = Boolean(data?.availableInLibrary);
  const isAdmin = Boolean(data?.isAdmin);
  const manage = data?.manage;
  const radarr = data?.radarr ?? null;
  const actionMenu = (
    <MediaActionMenu
      title={title}
      mediaType="movie"
      tmdbId={tmdbId}
      playUrl={data?.playUrl ?? undefined}
      trailerUrl={trailerUrl ?? undefined}
      backdropUrl={backdropUrl ?? undefined}
      isAdmin={isAdmin}
      showReport
      manageItemId={manage?.itemId ?? null}
      manageSlug={manage?.slug ?? null}
      manageBaseUrl={manage?.baseUrl ?? null}
      prowlarrEnabled={Boolean(radarr?.prowlarrEnabled)}
    />
  );

  // Track view
  useTrackView({
    mediaType: "movie",
    tmdbId,
    title,
    posterPath: posterUrl ?? null,
  });

  return (
    <>
      {available ? (
        <>
          <MediaListButtons tmdbId={tmdbId} mediaType="movie" />
          <ShareButton
            mediaType="movie"
            tmdbId={tmdbId}
            title={title}
            backdropPath={backdropUrl ?? null}
            posterUrl={posterUrl ?? null}
          />
          {actionMenu}
        </>
      ) : (
        <>
          <MediaListButtons tmdbId={tmdbId} mediaType="movie" />
          <ShareButton
            mediaType="movie"
            tmdbId={tmdbId}
            title={title}
            backdropPath={backdropUrl ?? null}
            posterUrl={posterUrl ?? null}
          />
          {actionMenu}
          <MovieRequestPanel
            tmdbId={tmdbId}
            prefetched={radarr ? { ...radarr, isAdmin } : undefined}
            loading={isLoading}
            title={title}
            posterUrl={posterUrl}
            backdropUrl={backdropUrl}
            year={year}
          />
        </>
      )}
    </>
  );
}
