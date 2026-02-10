"use client";

import useSWR from "swr";
import Image from "next/image";
import Link from "next/link";
import rtFreshLogo from "@/assets/rt_fresh.svg";
import rtRottenLogo from "@/assets/rt_rotten.svg";
import rtAudFreshLogo from "@/assets/rt_aud_fresh.svg";
import rtAudRottenLogo from "@/assets/rt_aud_rotten.svg";
import imdbLogo from "@/assets/imdb.svg";

const fetcher = (url: string) => fetch(url).then(r => r.json());

type Ratings = {
  imdbId: string | null;
  imdbRating: string | null;
  metacriticScore: string | null;
  rtCriticsScore: number | null;
  rtCriticsRating: string | null;
  rtAudienceScore: number | null;
  rtAudienceRating: string | null;
  rtUrl: string | null;
};

type RatingsResponse = { ratings: Ratings };

export function ExternalRatings({
  tmdbId,
  mediaType,
  imdbId,
  initialData,
}: {
  tmdbId: number;
  mediaType: "movie" | "tv";
  imdbId: string | null;
  initialData?: RatingsResponse | null;
}) {
  const { data, isLoading } = useSWR<{ ratings: Ratings }>(
    `/api/v1/ratings/${mediaType}/${tmdbId}`,
    fetcher,
    { revalidateOnFocus: false, fallbackData: initialData ?? undefined }
  );

  if (isLoading && !data) {
    return null;
  }

  if (!data || !data.ratings) {
    return null;
  }

  const { ratings } = data;
  const hasAny = ratings.imdbRating || ratings.rtCriticsScore !== null || ratings.rtAudienceScore !== null;

  if (!hasAny) {
    return null;
  }

  const ratingBadgeClass =
    "media-rating px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all";

  return (
    <>
      {/* Rotten Tomatoes - Critics Score */}
      {ratings.rtCriticsScore !== null && ratings.rtCriticsScore !== undefined && (
        <Link
          href={ratings.rtUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className={ratingBadgeClass}
          title={`Rotten Tomatoes Critics: ${ratings.rtCriticsScore}%`}
        >
          <div className="w-5 h-5 sm:w-6 sm:h-6 relative">
            <Image
              src={ratings.rtCriticsScore >= 60 ? rtFreshLogo : rtRottenLogo}
              alt="RT Critics"
              fill
              className="object-contain"
            />
          </div>
          <span className="text-xs sm:text-sm font-bold text-white">{ratings.rtCriticsScore}%</span>
        </Link>
      )}

      {/* Rotten Tomatoes - Audience Score */}
      {ratings.rtAudienceScore !== null && ratings.rtAudienceScore !== undefined && (
        <Link
          href={ratings.rtUrl || "#"}
          target="_blank"
          rel="noopener noreferrer"
          className={ratingBadgeClass}
          title={`Rotten Tomatoes Audience: ${ratings.rtAudienceScore}%`}
        >
          <div className="w-5 h-5 sm:w-6 sm:h-6 relative">
            <Image
              src={ratings.rtAudienceScore >= 60 ? rtAudFreshLogo : rtAudRottenLogo}
              alt="RT Audience"
              fill
              className="object-contain"
            />
          </div>
          <span className="text-xs sm:text-sm font-bold text-white">{ratings.rtAudienceScore}%</span>
        </Link>
      )}

      {/* IMDB Rating */}
      {imdbId && ratings.imdbRating && (
        <Link
          href={`https://www.imdb.com/title/${imdbId}`}
          target="_blank"
          rel="noopener noreferrer"
          className={ratingBadgeClass}
          title={`IMDb Rating: ${ratings.imdbRating}/10`}
        >
          <div className="w-5 h-5 sm:w-6 sm:h-6 relative">
            <Image src={imdbLogo} alt="IMDb" fill className="object-contain" />
          </div>
          <span className="text-xs sm:text-sm font-bold text-white">{ratings.imdbRating}</span>
        </Link>
      )}
    </>
  );
}
