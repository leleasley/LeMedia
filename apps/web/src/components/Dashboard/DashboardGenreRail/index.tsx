"use client";

import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { useEffect, useState, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import CachedImage from "@/components/Common/CachedImage";
import { useWheelForHorizontalScroll } from "@/hooks/useWheelForHorizontalScroll";

type Genre = { id: number; name: string; image?: string | null };

// Jellyseerr-style genre color mapping (duotone colors)
const genreColorMap: Record<number, string> = {
    28: "ff6b35,004e89", // Action - Orange/Blue
    12: "f77f00,fcbf49", // Adventure - Gold/Orange
    16: "d62828,f77f00", // Animation - Red/Orange
    35: "06d6a0,118ab2", // Comedy - Teal/Blue
    80: "a4243b,f18f01", // Crime - Red/Orange
    99: "d62828,f77f00", // Documentary - Red/Orange
    18: "d62828,f77f00", // Drama - Red/Orange
    10751: "06d6a0,118ab2", // Family - Teal/Blue
    14: "d62828,f77f00", // Fantasy - Red/Orange
    36: "f77f00,fcbf49", // History - Gold/Orange
    27: "2e294e,541388", // Horror - Purple
    10402: "06d6a0,118ab2", // Music - Teal/Blue
    9648: "2e294e,541388", // Mystery - Purple
    10749: "06d6a0,118ab2", // TV Movie - Teal/Blue
    53: "a4243b,f18f01", // Thriller - Red/Orange
    10752: "ff6b35,004e89", // War - Orange/Blue
    37: "ff6b35,004e89", // Western - Orange/Blue
};

export function DashboardGenreRail({ type = "movie" }: { type?: "movie" | "tv" }) {
    const [genres, setGenres] = useState<Genre[]>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(true);
    const handleWheel = useWheelForHorizontalScroll(scrollRef);

    const checkScroll = () => {
        if (scrollRef.current) {
            setCanScrollLeft(scrollRef.current.scrollLeft > 0);
            setCanScrollRight(
                scrollRef.current.scrollLeft < scrollRef.current.scrollWidth - scrollRef.current.clientWidth - 10
            );
        }
    };

    const scroll = (direction: "left" | "right") => {
        if (scrollRef.current) {
            const scrollAmount = window.innerWidth > 768 ? 600 : 300;
            scrollRef.current.scrollBy({
                left: direction === "left" ? -scrollAmount : scrollAmount,
                behavior: "smooth",
            });
            setTimeout(checkScroll, 300);
        }
    };

    useEffect(() => {
        let mounted = true;
        async function load() {
            setLoading(true);
            try {
                const res = await fetch(`/api/v1/tmdb/genres?type=${type}`);
                const data = await res.json();
                const list: Genre[] = (data.genres ?? []).slice(0, 8).map((g: any) => ({ id: g.id, name: g.name, image: null }));

                // Fetch a representative backdrop for each genre using discover
                const withImages = await Promise.all(list.map(async (gen) => {
                    try {
                        const r = await fetch(`/api/v1/tmdb/discover/${type}?with_genres=${gen.id}&page=1`);
                        const d = await r.json();
                        const first = (d.results ?? [])[0];
                        if (first?.backdrop_path) {
                            return { ...gen, image: `/imageproxy/tmdb/t/p/w1280${first.backdrop_path}` };
                        } else if (first?.poster_path) {
                            return { ...gen, image: `/imageproxy/tmdb/t/p/w500${first.poster_path}` };
                        }
                    } catch (e) {
                        // ignore
                    }
                    return gen;
                }));

                if (mounted) setGenres(withImages);
            } catch (e) {
                if (mounted) setGenres([]);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        load();
        return () => { mounted = false; };
    }, [type]);

    useEffect(() => {
        checkScroll();
        const handleResize = () => checkScroll();
        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [genres.length]);

    if (!genres.length) return null;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
                    {type === "movie" ? "Movie Genres" : "TV Genres"}
                </h2>
                <PrefetchLink
                    href={type === "movie" ? "/movies" : "/tv"}
                    className="text-sm opacity-80 hover:opacity-100 transition-opacity"
                >
                    →
                </PrefetchLink>
            </div>

            <div className="relative group/carousel">
                {canScrollLeft && (
                    <button
                        onClick={() => scroll("left")}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 text-white p-2 rounded-full transition-colors"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                )}

                <div
                    ref={scrollRef}
                    className="flex gap-3 md:gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-4 -mx-3 px-3 md:mx-0 md:px-0"
                    onScroll={() => {
                        if (rafRef.current !== null) return;
                        rafRef.current = requestAnimationFrame(() => {
                            rafRef.current = null;
                            checkScroll();
                        });
                    }}
                    onWheel={handleWheel}
                >
                    {genres.map((g) => {
                        const colors = genreColorMap[g.id] || "ff6b35,004e89";
                        return (
                            <PrefetchLink
                                key={g.id}
                                href={`/${type === "movie" ? "movies" : "tv"}?with_genres=${g.id}`}
                                className="relative rounded-2xl overflow-hidden h-28 md:h-40 min-w-[160px] md:min-w-[240px] flex-shrink-0 group/card shadow-lg hover:shadow-2xl transition-all duration-300 border border-white/10 hover:border-white/30 hover:scale-[1.02]"
                            >
                                {g.image ? (
                                    <>
                                        <CachedImage
                                            type="tmdb"
                                            src={`${g.image}?blend=https://image.tmdb.org/t/p/w1280_filter(duotone,${colors})&blend_mode=screen`}
                                            alt={g.name}
                                            fill
                                            sizes="(max-width: 768px) 280px, 400px"
                                            className="object-cover group-hover/card:scale-110 transition-transform duration-300"
                                        />
                                        {/* Glass morphism overlay */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent backdrop-blur-sm" style={{ backdropFilter: "blur(2px)" }} />
                                    </>
                                ) : (
                                    <>
                                        <div className={`absolute inset-0 bg-gradient-to-br from-blue-600 to-orange-600`} />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent backdrop-blur-sm" style={{ backdropFilter: "blur(2px)" }} />
                                    </>
                                )}

                                <div className="absolute inset-0 flex items-end justify-center p-3 md:p-4 z-10">
                                    <h3 className="text-sm md:text-lg font-semibold text-white text-center drop-shadow-lg">
                                        {g.name}
                                    </h3>
                                </div>
                            </PrefetchLink>
                        );
                    })}
                </div>

                {canScrollRight && (
                    <button
                        onClick={() => scroll("right")}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/75 text-white p-2 rounded-full transition-colors"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                )}
            </div>
        </div>
    );
}
