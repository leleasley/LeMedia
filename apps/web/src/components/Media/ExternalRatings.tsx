"use client";

import useSWR from "swr";
import { Suspense } from "react";

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function ExternalRatings({
  tmdbId,
  mediaType,
  imdbId
}: {
  tmdbId: number;
  mediaType: "movie" | "tv";
  imdbId: string | null;
}) {
  const { data, isLoading } = useSWR(
    imdbId ? `/api/v1/ratings/${mediaType}/${tmdbId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  if (isLoading) {
    return (
      <div className="flex gap-3 flex-wrap">
        <div className="h-5 w-20 bg-white/10 animate-pulse rounded"></div>
        <div className="h-5 w-20 bg-white/10 animate-pulse rounded"></div>
      </div>
    );
  }

  if (!data || !data.ratings) {
    return null;
  }

  const { ratings } = data;
  const hasAny = ratings.imdbRating || ratings.rtCriticsScore || ratings.rtAudienceScore || ratings.metacriticScore;

  if (!hasAny) {
    return null;
  }

  return (
    <div className="flex gap-3 flex-wrap text-sm">
      {ratings.imdbRating && (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">IMDb</span>
          <span className="font-semibold text-yellow-400">{ratings.imdbRating}</span>
        </div>
      )}
      {ratings.rtCriticsScore !== null && (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">RT</span>
          <span className="font-semibold text-green-400">{ratings.rtCriticsScore}%</span>
        </div>
      )}
      {ratings.rtAudienceScore !== null && (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Audience</span>
          <span className="font-semibold text-blue-400">{ratings.rtAudienceScore}%</span>
        </div>
      )}
      {ratings.metacriticScore && (
        <div className="flex items-center gap-1.5">
          <span className="text-gray-400">Metacritic</span>
          <span className="font-semibold text-purple-400">{ratings.metacriticScore}</span>
        </div>
      )}
    </div>
  );
}
