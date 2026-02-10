"use client";

import Image from "next/image";
import { Film, Monitor } from "lucide-react";

type StreamingProvider = {
    logo_path: string;
    provider_id: number;
    provider_name: string;
    display_priority?: number;
};

type WatchProviders = {
    link?: string;
    flatrate?: StreamingProvider[];
    rent?: StreamingProvider[];
    buy?: StreamingProvider[];
    free?: StreamingProvider[];
    ads?: StreamingProvider[];
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
    watchProviders?: WatchProviders | null;
    genres?: Array<{ id: number; name: string }>;
    status?: string;
    originalLanguage?: string;
    productionCountries?: Array<{ name: string }>;
    networks?: Array<{ name: string; logo_path?: string }>;
    releaseDates?: any;
    contentRatings?: any;
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
    watchProviders,
    status,
    originalLanguage,
    productionCountries = [],
    networks = [],
    releaseDates,
    contentRatings,
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

    const getMovieCertification = (releaseData: any, region: string) => {
        if (!releaseData?.results) return undefined;
        const regionRow = releaseData.results.find((r: any) => r.iso_3166_1 === region) ||
            releaseData.results.find((r: any) => r.iso_3166_1 === "US");
        if (!regionRow?.release_dates) return undefined;
        const withCert = regionRow.release_dates.find((rd: any) => rd.certification);
        return withCert?.certification || undefined;
    };

    const getTvRating = (ratingsData: any, region: string) => {
        if (!ratingsData?.results) return undefined;
        const regionRow = ratingsData.results.find((r: any) => r.iso_3166_1 === region) ||
            ratingsData.results.find((r: any) => r.iso_3166_1 === "US");
        return regionRow?.rating || undefined;
    };

    const getReleaseTimeline = (releaseData: any, region: string) => {
        if (!releaseData?.results) return [];
        const regionRow = releaseData.results.find((r: any) => r.iso_3166_1 === region) ||
            releaseData.results.find((r: any) => r.iso_3166_1 === "US");
        const dates = Array.isArray(regionRow?.release_dates) ? regionRow.release_dates : [];
        const byType = new Map<number, string>();
        for (const entry of dates) {
            const type = Number(entry?.type);
            const dateStr = entry?.release_date ? String(entry.release_date).split("T")[0] : "";
            if (!type || !dateStr) continue;
            const existing = byType.get(type);
            if (!existing || dateStr < existing) {
                byType.set(type, dateStr);
            }
        }
        const ordered = [
            { type: 1, label: "Premiere" },
            { type: 2, label: "Limited" },
            { type: 3, label: "Theatrical" },
            { type: 4, label: "Digital/Streaming" },
            { type: 5, label: "Physical" },
            { type: 6, label: "TV" }
        ];
        return ordered
            .map(({ type, label }) => {
                const date = byType.get(type);
                return date ? { label, date } : null;
            })
            .filter(Boolean) as Array<{ label: string; date: string }>;
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

    const region = process.env.NEXT_PUBLIC_TMDB_REGION || "GB";
    const certification = type === "movie"
        ? getMovieCertification(releaseDates, region)
        : getTvRating(contentRatings, region);
    if (certification) {
        facts.push({ label: "Rating", value: certification });
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

    const providerData: WatchProviders | null = watchProviders || (streamingProviders.length > 0
        ? { flatrate: streamingProviders }
        : null);

    if (facts.length === 0 && !providerData) return null;
    const releaseTimeline = type === "movie" ? getReleaseTimeline(releaseDates, region) : [];

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

            {releaseTimeline.length > 0 && (
                <div className="border-t border-white/5 px-4 py-3">
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-2">Release Timeline</div>
                    <div className="flex flex-wrap gap-3">
                        {releaseTimeline.map((item) => (
                            <div key={item.label} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                                <div className="text-[10px] uppercase tracking-wider text-gray-400">{item.label}</div>
                                <div className="text-sm font-semibold text-white">{formatDate(item.date)}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {providerData && (
                <div className="border-t border-white/5 px-4 py-3 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 uppercase tracking-wider font-medium whitespace-nowrap">Where to watch</span>
                    </div>
                    <div className="space-y-3">
                        {([
                            { key: "flatrate", label: "Stream" },
                            { key: "rent", label: "Rent" },
                            { key: "buy", label: "Buy" },
                            { key: "free", label: "Free" },
                            { key: "ads", label: "With ads" }
                        ] as const).map(({ key, label }) => {
                            const list = (providerData[key] ?? []).filter((provider) =>
                                Boolean(provider?.provider_name) && Boolean(provider?.logo_path)
                            );
                            if (!list || list.length === 0) return null;
                            return (
                                <div key={key} className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs text-gray-500 uppercase tracking-wider font-medium w-20 shrink-0">{label}</span>
                                    <div className="flex flex-wrap gap-2">
                                        {list.slice(0, 6).map((provider) => (
                                            <div
                                                key={provider.provider_id}
                                                className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5"
                                                title={provider.provider_name}
                                            >
                                                <div className="w-6 h-6 rounded overflow-hidden border border-white/10">
                                                    <Image
                                                        src={`https://image.tmdb.org/t/p/original${provider.logo_path}`}
                                                        alt={provider.provider_name}
                                                        width={24}
                                                        height={24}
                                                        className="object-cover"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
