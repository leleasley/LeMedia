"use client";

import Image from "next/image";
import { Film, Monitor } from "lucide-react";

type StreamingProvider = {
    logo_path: string;
    provider_id: number;
    provider_name: string;
    display_priority?: number;
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
    streamingProviders = [],
    status,
    originalLanguage,
    productionCountries = [],
    networks = [],
    releaseDates,
    type = "movie",
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
                const theatrical = country.release_dates?.find((rd: any) => rd.type === 3);
                if (theatrical?.release_date) {
                    theatricalRelease = theatrical.release_date.split("T")[0];
                    break;
                }
            }
        }
    }

    // Collect all facts into an array for grid rendering
    const facts: { label: string; value: React.ReactNode; icon?: React.ReactNode }[] = [];

    if (theatricalRelease || digitalReleaseDate || releaseDate || firstAirDate) {
        facts.push({
            label: type === "movie" ? "Release Date" : "First Air Date",
            value: formatDate(releaseDate || firstAirDate),
            icon: theatricalRelease ? <Film className="h-3.5 w-3.5 text-blue-400" /> : undefined,
        });
    }

    if (digitalReleaseDate && digitalReleaseDate !== releaseDate) {
        facts.push({
            label: "Digital Release",
            value: formatDate(digitalReleaseDate),
            icon: <Monitor className="h-3.5 w-3.5 text-purple-400" />,
        });
    }

    if (status) {
        facts.push({ label: "Status", value: status });
    }

    if (runtime && runtime > 0) {
        facts.push({ label: "Runtime", value: formatRuntime(runtime) });
    }

    if (originalLanguage) {
        facts.push({ label: "Language", value: getLanguageName(originalLanguage) });
    }

    if (productionCountries.length > 0) {
        facts.push({ label: "Country", value: productionCountries[0].name });
    }

    if (type === "tv" && networks.length > 0) {
        facts.push({ label: "Network", value: networks[0].name });
    }

    if (facts.length === 0 && streamingProviders.length === 0) return null;

    return (
        <div className="media-facts">
            <div className="media-details-grid">
                {facts.map((fact, i) => (
                    <div key={i} className="media-fact">
                        <span className="flex items-center gap-1.5 text-xs text-gray-500 uppercase tracking-wider font-medium">
                            {fact.icon}
                            {fact.label}
                        </span>
                        <span className="media-fact-value text-sm font-semibold text-white">
                            {fact.value}
                        </span>
                    </div>
                ))}
            </div>

            {streamingProviders.length > 0 && (
                <div className="flex items-center gap-3 border-t border-white/5 px-4 py-3">
                    <span className="text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">Streaming</span>
                    <div className="flex flex-wrap gap-2">
                        {streamingProviders.slice(0, 6).map((provider) => (
                            <div
                                key={provider.provider_id}
                                className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg overflow-hidden border border-white/10 hover:border-white/30 transition-all hover:scale-110"
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
            )}
        </div>
    );
}
