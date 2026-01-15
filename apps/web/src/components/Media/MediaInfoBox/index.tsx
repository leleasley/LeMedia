"use client";

import Image from "next/image";
import Link from "next/link";
import { Calendar, Clock, Star, Tv, Play, ExternalLink, Film, Monitor } from "lucide-react";
import tmdbLogo from "@/assets/tmdb_logo.svg";
import imdbLogo from "@/assets/imdb.svg";
import rtFreshLogo from "@/assets/rt_fresh.svg";
import rtRottenLogo from "@/assets/rt_rotten.svg";
import rtAudFreshLogo from "@/assets/rt_aud_fresh.svg";
import rtAudRottenLogo from "@/assets/rt_aud_rotten.svg";

type StreamingProvider = {
    logo_path: string;
    provider_id: number;
    provider_name: string;
    display_priority?: number;
};

type ReleaseDateInfo = {
    type: number;
    release_date: string;
    note?: string;
};

type MediaInfoBoxProps = {
    releaseDate?: string;
    firstAirDate?: string;
    digitalReleaseDate?: string;
    runtime?: number;
    voteAverage?: number;
    tmdbId?: number;
    imdbId?: string | null;
    imdbRating?: string | null;
    rtCriticsScore?: number | null;
    rtCriticsRating?: string | null;
    rtAudienceScore?: number | null;
    rtAudienceRating?: string | null;
    rtUrl?: string | null;
    metacriticScore?: string | null;
    streamingProviders?: StreamingProvider[];
    genres?: Array<{ id: number; name: string }>;
    status?: string;
    originalLanguage?: string;
    productionCountries?: Array<{ name: string }>;
    networks?: Array<{ name: string; logo_path?: string }>;
    releaseDates?: any;
    type?: "movie" | "tv";
    tvdbId?: number | null;
    jellyfinUrl?: string | null;
    externalRatingsSlot?: React.ReactNode;
};

export function MediaInfoBox({
    releaseDate,
    firstAirDate,
    digitalReleaseDate,
    runtime,
    voteAverage,
    tmdbId,
    imdbId,
    imdbRating,
    rtCriticsScore,
    rtCriticsRating,
    rtAudienceScore,
    rtAudienceRating,
    rtUrl,
    metacriticScore,
    streamingProviders = [],
    genres = [],
    status,
    originalLanguage,
    productionCountries = [],
    networks = [],
    releaseDates,
    type = "movie",
    tvdbId,
    jellyfinUrl,
    externalRatingsSlot
}: MediaInfoBoxProps) {

    const formatDate = (dateStr: string | undefined) => {
        if (!dateStr) return "Unknown";
        try {
            return new Date(dateStr).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric"
            });
        } catch {
            return dateStr;
        }
    };

    const formatRuntime = (minutes: number | undefined) => {
        if (!minutes) return null;
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    const getLanguageName = (code: string | undefined) => {
        if (!code) return "Unknown";
        const languages: Record<string, string> = {
            en: "English",
            es: "Spanish",
            fr: "French",
            de: "German",
            it: "Italian",
            ja: "Japanese",
            ko: "Korean",
            zh: "Chinese",
            pt: "Portuguese",
            ru: "Russian",
            ar: "Arabic",
            hi: "Hindi",
        };
        return languages[code] || code.toUpperCase();
    };

    // Extract theatrical release date from release_dates
    let theatricalRelease: string | undefined;
    if (releaseDates?.results) {
        const region = process.env.NEXT_PUBLIC_TMDB_REGION || "GB";
        for (const country of releaseDates.results) {
            if (country.iso_3166_1 === region || country.iso_3166_1 === "US") {
                const theatrical = country.release_dates?.find((rd: any) => rd.type === 3); // Type 3 = Theatrical
                if (theatrical?.release_date) {
                    theatricalRelease = theatrical.release_date.split("T")[0];
                    break;
                }
            }
        }
    }

    return (
        <div className="media-facts">
            {/* Ratings Section - Horizontal row at top like Jellyseerr */}
            {(voteAverage || rtCriticsScore || rtAudienceScore || imdbRating || externalRatingsSlot) && (
                <div className="media-ratings">
                    {/* TMDB Rating */}
                    {voteAverage && voteAverage > 0 && (
                        <Link
                            href={`https://www.themoviedb.org/${type}/${tmdbId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                            title={`TMDB User Score: ${(voteAverage * 10).toFixed(0)}%`}
                        >
                            <div className="w-5 h-5 sm:w-6 sm:h-6 relative">
                                <Image src={tmdbLogo} alt="TMDB" fill className="object-contain" />
                            </div>
                            <span className="text-xs sm:text-sm font-bold text-white">{(voteAverage * 10).toFixed(0)}%</span>
                        </Link>
                    )}

                    {/* RT/IMDB from Suspense streaming OR from props (fallback) */}
                    {externalRatingsSlot ? externalRatingsSlot : (
                        <>
                            {/* Rotten Tomatoes - Critics Score */}
                            {rtCriticsScore !== null && rtCriticsScore !== undefined && (
                                <Link
                                    href={rtUrl || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                                    title={`Rotten Tomatoes Critics: ${rtCriticsScore}%`}
                                >
                                    <div className="w-5 h-5 sm:w-6 sm:h-6 relative">
                                        <Image
                                            src={rtCriticsScore >= 60 ? rtFreshLogo : rtRottenLogo}
                                            alt="RT Critics"
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-white">{rtCriticsScore}%</span>
                                </Link>
                            )}

                            {/* Rotten Tomatoes - Audience Score */}
                            {rtAudienceScore !== null && rtAudienceScore !== undefined && (
                                <Link
                                    href={rtUrl || "#"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                                    title={`Rotten Tomatoes Audience: ${rtAudienceScore}%`}
                                >
                                    <div className="w-5 h-5 sm:w-6 sm:h-6 relative">
                                        <Image
                                            src={rtAudienceScore >= 60 ? rtAudFreshLogo : rtAudRottenLogo}
                                            alt="RT Audience"
                                            fill
                                            className="object-contain"
                                        />
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-white">{rtAudienceScore}%</span>
                                </Link>
                            )}

                            {/* IMDB Rating */}
                            {imdbId && imdbRating && (
                                <Link
                                    href={`https://www.imdb.com/title/${imdbId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex flex-col items-center gap-0.5 sm:gap-1 px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                                    title={`IMDb Rating: ${imdbRating}/10`}
                                >
                                    <div className="w-5 h-5 sm:w-6 sm:h-6 relative">
                                        <Image src={imdbLogo} alt="IMDb" fill className="object-contain" />
                                    </div>
                                    <span className="text-xs sm:text-sm font-bold text-white">{imdbRating}</span>
                                </Link>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Release Info with Icons */}
            {(theatricalRelease || digitalReleaseDate || releaseDate || firstAirDate) && (
                <div className="media-fact">
                    <span className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                        {theatricalRelease && (
                            <span className="inline-flex items-center gap-1" title="Theatrical Release">
                                <Film className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-blue-400" />
                            </span>
                        )}
                        {digitalReleaseDate && (
                            <span className="inline-flex items-center gap-1" title="Digital Release">
                                <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-400" />
                            </span>
                        )}
                        {type === "movie" ? "Release Date" : "First Air Date"}
                    </span>
                    <span className="media-fact-value text-xs sm:text-sm">
                        {formatDate(releaseDate || firstAirDate)}
                    </span>
                </div>
            )}

            {/* Digital Release (separate line if available) */}
            {digitalReleaseDate && digitalReleaseDate !== releaseDate && (
                <div className="media-fact">
                    <span className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                        <Monitor className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-400" />
                        Digital Release
                    </span>
                    <span className="media-fact-value text-xs sm:text-sm">{formatDate(digitalReleaseDate)}</span>
                </div>
            )}

            {/* Status */}
            {status && (
                <div className="media-fact">
                    <span className="text-xs sm:text-sm">Status</span>
                    <span className="media-fact-value text-xs sm:text-sm">{status}</span>
                </div>
            )}

            {/* Runtime */}
            {runtime && runtime > 0 && (
                <div className="media-fact">
                    <span className="text-xs sm:text-sm">Runtime</span>
                    <span className="media-fact-value text-xs sm:text-sm">{formatRuntime(runtime)}</span>
                </div>
            )}

            {/* Original Language */}
            {originalLanguage && (
                <div className="media-fact">
                    <span className="text-xs sm:text-sm">Original Language</span>
                    <span className="media-fact-value text-xs sm:text-sm">{getLanguageName(originalLanguage)}</span>
                </div>
            )}

            {/* Production Country */}
            {productionCountries.length > 0 && (
                <div className="media-fact">
                    <span className="text-xs sm:text-sm">Production Country</span>
                    <span className="media-fact-value text-xs sm:text-sm">{productionCountries[0].name}</span>
                </div>
            )}

            {/* Network (for TV shows) */}
            {type === "tv" && networks.length > 0 && (
                <div className="media-fact">
                    <span className="text-xs sm:text-sm">Network</span>
                    <span className="media-fact-value text-xs sm:text-sm">{networks[0].name}</span>
                </div>
            )}

            {/* Streaming Providers */}
            {streamingProviders.length > 0 && (
                <div className="media-fact">
                    <span className="text-xs sm:text-sm">Currently Streaming On</span>
                    <div className="media-fact-value">
                        <div className="flex flex-wrap gap-1.5 sm:gap-2">
                            {streamingProviders.slice(0, 6).map((provider) => (
                                <div
                                    key={provider.provider_id}
                                    className="w-7 h-7 sm:w-9 sm:h-9 rounded-md overflow-hidden border border-white/10 hover:border-white/30 transition-all hover:scale-110"
                                    title={provider.provider_name}
                                >
                                    <Image
                                        src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
                                        alt={provider.provider_name}
                                        width={36}
                                        height={36}
                                        className="object-cover"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
