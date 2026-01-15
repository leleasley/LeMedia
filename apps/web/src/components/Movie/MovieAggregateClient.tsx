"use client";

import useSWR from "swr";
import { CheckCircle } from "lucide-react";
import { MediaActionMenu } from "@/components/Media/MediaActionMenu";
import { MediaListButtons } from "@/components/Media/MediaListButtons";
import { MovieRequestPanel } from "@/components/Movie/MovieRequestPanel";
import { PlayButton } from "@/components/Media/PlayButton";
import { FilmIcon } from "@heroicons/react/24/outline";
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

  if (!data?.availableInLibrary) return null;

  return (
    <div className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-500 px-3 text-xs font-semibold text-white shadow-sm">
      <CheckCircle className="h-4 w-4" />
      Available
    </div>
  );
}

export function MovieActionButtons({
  tmdbId,
  title,
  trailerUrl,
  backdropUrl,
  prefetched,
  posterUrl
}: {
  tmdbId: number;
  title: string;
  trailerUrl?: string | null;
  backdropUrl?: string | null;
  prefetched?: MovieAggregate;
  posterUrl?: string | null;
}) {
  const { data, isLoading } = useMovieAggregate(tmdbId, title, prefetched);
  const available = Boolean(data?.availableInLibrary);
  const isAdmin = Boolean(data?.isAdmin);
  const manage = data?.manage;
  const radarr = data?.radarr ?? null;

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
          />
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
          {trailerUrl ? (
            <PlayButton
              links={[
                {
                  text: "Watch Trailer",
                  url: trailerUrl,
                  svg: <FilmIcon />,
                },
              ]}
            />
          ) : null}
          <MovieRequestPanel
            tmdbId={tmdbId}
            prefetched={radarr ? { ...radarr, isAdmin } : undefined}
            loading={isLoading}
            title={title}
            posterUrl={posterUrl}
            backdropUrl={backdropUrl}
          />
        </>
      )}
    </>
  );
}
