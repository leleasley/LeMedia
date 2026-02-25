"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { HoverMediaCard } from "@/components/Media/HoverMediaCard";
import { tmdbImageUrl } from "@/lib/tmdb-images";
import useVerticalScroll from "@/hooks/useVerticalScroll";
import { fetchAvailabilityStatusBatched } from "@/lib/availability-client";

interface Network {
    id: number;
    name: string;
    logoPath: string | null;
}

interface TvShow {
    id: number;
    name: string;
    poster_path: string | null;
    first_air_date: string;
    vote_average: number;
    overview?: string;
}

interface DiscoverNetworkData {
    network: Network;
    results: TvShow[];
    page: number;
    totalPages: number;
    totalResults: number;
}

export default function DiscoverNetwork() {
    const params = useParams();
    const networkId = params.networkId as string;
    const [network, setNetwork] = useState<Network | null>(null);
    const [items, setItems] = useState<TvShow[]>([]);
    const [availability, setAvailability] = useState<Record<number, string>>({});
    const availabilityRef = useRef<Record<number, string>>({});
    const [loading, setLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const pageRef = useRef(1);
    const loadingRef = useRef(false);

    useEffect(() => {
        availabilityRef.current = availability;
    }, [availability]);

    const loadMore = useCallback(async () => {
        if (loadingRef.current || !hasMore) return;
        loadingRef.current = true;
        setLoading(true);

        try {
            const currentPage = pageRef.current;
            const response = await fetch(`/api/v1/tmdb/discover/tv/network/${networkId}?page=${currentPage}`);

            if (!response.ok) {
                throw new Error("Failed to fetch network data");
            }

            const data: DiscoverNetworkData = await response.json();

            // Set network info on first load
            if (currentPage === 1 && data.network) {
                setNetwork(data.network);
            }

            setItems(prev => [...prev, ...data.results]);

            // Fetch availability
            const missing = data.results
                .map(item => item.id)
                .filter(id => availabilityRef.current[id] === undefined);

            if (missing.length) {
                fetchAvailabilityStatusBatched("tv", missing)
                    .then(next => {
                        if (Object.keys(next).length) setAvailability(prev => ({ ...prev, ...next }));
                    })
                    .catch(() => { });
            }

            const totalPages = data.totalPages ?? currentPage;
            setHasMore(currentPage < totalPages);
            pageRef.current = currentPage + 1;
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
            setLoading(false);
            setInitialLoading(false);
            loadingRef.current = false;
        }
    }, [networkId, hasMore]);

    useEffect(() => {
        void loadMore();
    }, [loadMore]);

    useVerticalScroll(loadMore, !loading && hasMore);

    const cards = useMemo(() => {
        return items.map(show => ({
            id: show.id,
            title: show.name,
            year: show.first_air_date?.slice(0, 4) || "",
            rating: show.vote_average,
            poster: tmdbImageUrl(show.poster_path, "w500"),
            href: `/tv/${show.id}`,
            overview: show.overview,
            mediaStatus: availability[show.id] === "partially_available"
                ? 4
                : availability[show.id] === "available"
                ? 5
                : undefined
        }));
    }, [items, availability]);

    if (initialLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-white">Loading...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-red-500">Error: {error}</div>
            </div>
        );
    }

    return (
        <div className="space-y-4 md:space-y-6 px-4">
            {/* Network Header with Logo */}
            {network && (
                <div className="mt-6 mb-8">
                    {network.logoPath ? (
                        <div className="relative mb-6 flex h-24 justify-center sm:h-32">
                            <Image
                                src={`https://image.tmdb.org/t/p/w780_filter(duotone,ffffff,bababa)${network.logoPath}`}
                                alt={network.name}
                                className="object-contain"
                                fill
                                sizes="(max-width: 640px) 100vw, 780px"
                            />
                        </div>
                    ) : (
                        <h1 className="text-2xl md:text-3xl font-bold mt-1">{network.name} Series</h1>
                    )}
                </div>
            )}

            {/* TV Shows Grid - 3 columns on mobile, auto-fill on larger screens */}
            <ul className="grid grid-cols-3 gap-2 sm:gap-4 sm:grid-cols-none sm:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                {cards.map((show, index) => (
                    <li key={show.id}>
                        <HoverMediaCard
                            id={show.id}
                            title={show.title}
                            posterUrl={show.poster}
                            href={show.href}
                            year={show.year}
                            rating={show.rating}
                            description={show.overview}
                            mediaType="tv"
                            mediaStatus={show.mediaStatus}
                            imagePriority={index < 12}
                            imageLoading={index < 12 ? "eager" : "lazy"}
                            imageFetchPriority={index < 12 ? "high" : "auto"}
                            cardMode="requestable"
                        />
                    </li>
                ))}
            </ul>

            {loading && (
                <div className="flex justify-center py-8">
                    <div className="text-white">Loading more...</div>
                </div>
            )}
        </div>
    );
}
