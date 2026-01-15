"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWheelForHorizontalScroll } from "@/hooks/useWheelForHorizontalScroll";

type ContinueItem = {
  id: string;
  title: string;
  posterUrl: string | null;
  playUrl: string;
  progress: number;
  type: "movie" | "tv" | "episode";
};

export function ContinueWatchingCarousel({
  items,
  className,
}: {
  items: ContinueItem[];
  className?: string;
}) {
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
        <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">Continue Watching</h2>
      </div>

      <div className="relative group/carousel">
        {canScrollLeft && (
          <button
            onClick={() => scroll("left")}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full glass-strong transition-all duration-300 hover:scale-110 active:scale-95"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-6 w-6 text-foreground" />
          </button>
        )}

        <div
          ref={scrollRef}
          className="flex gap-3 md:gap-5 overflow-x-auto scrollbar-hide scroll-smooth pb-4 -mx-3 px-3 md:mx-0 md:px-0"
          onScroll={() => {
            if (rafRef.current !== null) return;
            rafRef.current = requestAnimationFrame(() => {
              rafRef.current = null;
              checkScroll();
            });
          }}
          onWheel={handleWheel}
        >
          {items.map((item) => (
            <a
              key={item.id}
              href={item.playUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-shrink-0 w-32 sm:w-36 md:w-40"
            >
              <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-gray-800 ring-1 ring-white/10 transition-all duration-300 hover:ring-white/30">
                {item.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.posterUrl}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                    No image
                  </div>
                )}
                <div className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                  {item.type === "movie" ? "Movie" : item.type === "episode" ? "Episode" : "Series"}
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-2 text-xs font-semibold text-white line-clamp-2">
                  {item.title}
                </div>
                {item.progress > 0 ? (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.round(item.progress * 100)}%` }} />
                  </div>
                ) : null}
              </div>
            </a>
          ))}
        </div>

        {canScrollRight && (
          <button
            onClick={() => scroll("right")}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full glass-strong transition-all duration-300 hover:scale-110 active:scale-95"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-6 w-6 text-foreground" />
          </button>
        )}
      </div>
    </div>
  );
}
