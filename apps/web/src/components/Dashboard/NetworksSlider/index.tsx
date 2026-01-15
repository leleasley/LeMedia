"use client";

import { useEffect, useState, useRef } from "react";
import CompanyCard from "@/components/Media/CompanyCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWheelForHorizontalScroll } from "@/hooks/useWheelForHorizontalScroll";

interface Network {
    id: number;
    name: string;
    logoUrl: string;
}

interface NetworksSliderProps {
    items: Network[];
    className?: string;
}

export function NetworksSlider({ items, className }: NetworksSliderProps) {
    const containerRef = useRef<HTMLDivElement>(null);
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
        } else {
            setCanScrollLeft(false);
            setCanScrollRight(false);
        }
    };

    const scroll = (direction: "left" | "right") => {
        if (scrollRef.current) {
            const scrollAmount = window.innerWidth > 768 ? 800 : 300;
            scrollRef.current.scrollBy({
                left: direction === "left" ? -scrollAmount : scrollAmount,
                behavior: "smooth",
            });
            setTimeout(checkScroll, 300);
        }
    };

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
    }, [items.length]);

    if (!items.length) return null;

    return (
        <div ref={containerRef} className={cn("space-y-4", className)}>
            <div className="flex items-center justify-between">
                <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Networks</h2>
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
                    className="flex gap-3 md:gap-5 overflow-x-auto overflow-y-visible scrollbar-hide scroll-smooth py-4 -mx-3 px-3 md:mx-0 md:px-0"
                    onScroll={() => {
                        if (rafRef.current !== null) return;
                        rafRef.current = requestAnimationFrame(() => {
                            rafRef.current = null;
                            checkScroll();
                        });
                    }}
                    onWheel={handleWheel}
                >
                    {items.map((network) => (
                        <div
                            key={network.id}
                            className="flex-shrink-0"
                        >
                            <CompanyCard
                                name={network.name}
                                image={network.logoUrl}
                                url={`/discover/tv/network/${network.id}`}
                            />
                        </div>
                    ))}
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
