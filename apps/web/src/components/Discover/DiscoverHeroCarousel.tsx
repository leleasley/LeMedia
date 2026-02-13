"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { cn } from "@/lib/utils";
import Link from "next/link";
import rtFreshLogo from "@/assets/rt_fresh.svg";
import rtRottenLogo from "@/assets/rt_rotten.svg";
import rtAudFreshLogo from "@/assets/rt_aud_fresh.svg";
import rtAudRottenLogo from "@/assets/rt_aud_rotten.svg";

export interface HeroCarouselItem {
  id: number;
  title: string;
  overview?: string;
  backdropUrl: string | null;
  posterUrl: string | null;
  rating?: number;
  year?: string;
  type?: "movie" | "tv";
  externalRatings?: {
    title: string;
    url: string;
    criticsRating?: string;
    criticsScore?: number;
    audienceRating?: string;
    audienceScore?: number;
    year?: number;
  } | null;
}

interface DiscoverHeroCarouselProps {
  items: HeroCarouselItem[];
  autoPlayInterval?: number;
}

const SWIPE_THRESHOLD = 50;

export function DiscoverHeroCarousel({
  items,
  autoPlayInterval = 6000,
}: DiscoverHeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );

  const goToSlide = useCallback(
    (nextIndex: number) => {
      if (nextIndex === currentIndex || isTransitioning) return;

      setIsTransitioning(true);
      setCurrentIndex(nextIndex);
      setProgressKey((k) => k + 1);

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      transitionTimerRef.current = setTimeout(() => {
        setDisplayIndex(nextIndex);
        setIsTransitioning(false);
      }, 900);
    },
    [currentIndex, isTransitioning]
  );

  const handleNavigation = useCallback(
    (direction: "next" | "prev") => {
      if (isTransitioning) return;
      const nextIndex =
        direction === "next"
          ? (currentIndex + 1) % items.length
          : (currentIndex - 1 + items.length) % items.length;
      goToSlide(nextIndex);
    },
    [currentIndex, items.length, isTransitioning, goToSlide]
  );

  const handleDotClick = useCallback(
    (index: number) => {
      goToSlide(index);
    },
    [goToSlide]
  );

  // Touch/swipe handlers
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isTransitioning) return;
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    },
    [isTransitioning]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || isTransitioning) return;
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touch.clientY - touchStartRef.current.y;
      const elapsed = Date.now() - touchStartRef.current.time;
      touchStartRef.current = null;

      if (
        Math.abs(deltaX) < SWIPE_THRESHOLD ||
        Math.abs(deltaY) > Math.abs(deltaX)
      )
        return;
      if (elapsed > 800) return;

      handleNavigation(deltaX < 0 ? "next" : "prev");
    },
    [isTransitioning, handleNavigation]
  );

  // Auto-play
  useEffect(() => {
    if (items.length <= 1) return;

    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
    }
    autoPlayTimerRef.current = setTimeout(() => {
      handleNavigation("next");
    }, autoPlayInterval);

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, [currentIndex, autoPlayInterval, items.length, handleNavigation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  if (!items.length) return null;

  const current = items[currentIndex];

  return (
    <div
      className="discover-hero relative overflow-hidden bg-[hsl(var(--background))] md:bg-[#0b1120]"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`@keyframes hero-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
      <div className="relative w-full min-h-[82svh] sm:min-h-[84svh] md:min-h-[70vh] lg:min-h-[74vh] xl:min-h-[78vh]">
        {/* All slide images stacked - crossfade via opacity */}
        {items.map((item, index) => {
          const imgSrc = item.backdropUrl ?? item.posterUrl;
          if (!imgSrc) return null;

          const isActive = index === currentIndex;
          const wasActive = index === displayIndex;
          const shouldRender = isActive || wasActive;

          if (!shouldRender) return null;

          return (
            <div
              key={item.id}
              className={cn(
                "absolute inset-0 transition-opacity duration-[900ms] ease-in-out",
                isActive ? "opacity-100 z-[1]" : "opacity-0 z-0"
              )}
            >
              <Image
                src={imgSrc}
                alt={item.title}
                fill
                className="object-cover"
                priority={index === 0}
                quality={90}
                sizes="100vw"
              />
            </div>
          );
        })}

        {/* Desktop gradient overlays - cinematic multi-layer */}
        <div className="absolute inset-0 z-[2] hidden md:block media-page-gradient" />
        <div className="absolute inset-0 z-[3] hidden md:block bg-gradient-to-b from-black/20 via-black/25 to-black/70" />
        <div className="absolute inset-0 z-[4] hidden md:block bg-gradient-to-r from-black/55 via-black/25 to-black/60" />
        <div
          className="absolute inset-0 z-[5] hidden md:block"
          style={{
            background:
              "linear-gradient(to top, #0b1120 0%, rgba(11,17,32,0.55) 40%, transparent 100%)",
          }}
        />

        {/* Mobile gradient - tight fade at bottom, image visible above */}
        <div
          className="absolute inset-0 z-[2] md:hidden pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, transparent 32%, hsl(var(--background) / 0.55) 50%, hsl(var(--background) / 0.85) 65%, hsl(var(--background) / 0.98) 76%, hsl(var(--background)) 82%, hsl(var(--background)) 100%)",
          }}
        />

        {/* Content Overlay */}
        <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 pb-10 pt-[calc(env(safe-area-inset-top)+4.25rem)] sm:px-6 sm:pb-12 sm:pt-[calc(env(safe-area-inset-top)+4.5rem)] md:px-10 md:pb-10 md:pt-24 lg:px-14 lg:pb-12 lg:pt-28">
          <div className="space-y-4 md:space-y-6 max-w-3xl">
            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white drop-shadow-lg leading-tight">
                {current.title}
              </h1>

              <div className="flex items-center gap-4 text-sm md:text-base text-gray-100 flex-wrap">
                {current.year && (
                  <span className="font-semibold">{current.year}</span>
                )}
                {current.rating && current.rating > 0 && (
                  <>
                    <span className="opacity-70">&bull;</span>
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="text-yellow-400">★</span>
                      {current.rating.toFixed(1)}
                    </span>
                  </>
                )}
              </div>

              {current.externalRatings && (
                <div className="flex items-center gap-3 flex-wrap pt-1">
                  {typeof current.externalRatings.criticsScore === "number" && (
                    <Link
                      href={current.externalRatings.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="media-rating px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                      title={`Rotten Tomatoes Critics: ${current.externalRatings.criticsScore}%`}
                    >
                      <div className="relative h-5 w-5 sm:h-6 sm:w-6">
                        <Image
                          src={
                            current.externalRatings.criticsScore >= 60
                              ? rtFreshLogo
                              : rtRottenLogo
                          }
                          alt="RT Critics"
                          fill
                          className="object-contain"
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-white">
                        {current.externalRatings.criticsScore}%
                      </span>
                    </Link>
                  )}

                  {typeof current.externalRatings.audienceScore ===
                    "number" && (
                    <Link
                      href={current.externalRatings.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="media-rating px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                      title={`Rotten Tomatoes Audience: ${current.externalRatings.audienceScore}%`}
                    >
                      <div className="relative h-5 w-5 sm:h-6 sm:w-6">
                        <Image
                          src={
                            current.externalRatings.audienceScore >= 60
                              ? rtAudFreshLogo
                              : rtAudRottenLogo
                          }
                          alt="RT Audience"
                          fill
                          className="object-contain"
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-white">
                        {current.externalRatings.audienceScore}%
                      </span>
                    </Link>
                  )}
                </div>
              )}
            </div>

            {current.overview && (
              <p className="text-sm md:text-base lg:text-lg text-gray-100 line-clamp-3 md:line-clamp-4 opacity-90 max-w-2xl leading-relaxed">
                {current.overview}
              </p>
            )}

            <div className="flex items-center gap-3 pt-2">
              <PrefetchLink
                href={
                  current.type === "tv"
                    ? `/tv/${current.id}`
                    : `/movie/${current.id}`
                }
              >
                <button className="group flex items-center gap-2.5 px-6 md:px-8 py-3 md:py-3.5 bg-white/15 hover:bg-white/25 backdrop-blur-md text-white font-semibold rounded-lg transition-all duration-200 active:scale-95 text-sm md:text-base border border-white/20 hover:border-white/30">
                  <Play
                    className="h-4 w-4 md:h-5 md:w-5"
                    fill="currentColor"
                  />
                  <span>More Info</span>
                </button>
              </PrefetchLink>
            </div>
          </div>
        </div>

        {/* Navigation Controls */}
        {items.length > 1 && (
          <>
            {/* Arrows - hidden on mobile (use swipe) */}
            <button
              onClick={() => handleNavigation("prev")}
              disabled={isTransitioning}
              className="absolute left-3 sm:left-4 md:left-6 top-1/2 -translate-y-1/2 z-20 p-1.5 md:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 disabled:opacity-50 backdrop-blur-sm hidden sm:block"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4 md:h-6 md:w-6" />
            </button>

            <button
              onClick={() => handleNavigation("next")}
              disabled={isTransitioning}
              className="absolute right-3 sm:right-4 md:right-6 top-1/2 -translate-y-1/2 z-20 p-1.5 md:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 disabled:opacity-50 backdrop-blur-sm hidden sm:block"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4 md:h-6 md:w-6" />
            </button>

            {/* Progress indicators */}
            <div className="absolute bottom-5 md:bottom-7 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
              {items.map((_, index) => (
                <button
                  key={index}
                  onClick={() => handleDotClick(index)}
                  disabled={isTransitioning}
                  className={cn(
                    "relative h-[3px] rounded-full overflow-hidden transition-all duration-500 disabled:cursor-not-allowed",
                    currentIndex === index
                      ? "w-10 md:w-12 bg-white/25"
                      : "w-2 md:w-2.5 bg-white/30 hover:bg-white/50"
                  )}
                  aria-label={`Go to slide ${index + 1}`}
                >
                  {currentIndex === index && (
                    <span
                      key={progressKey}
                      className="absolute inset-0 rounded-full bg-white origin-left"
                      style={{
                        animation: `hero-progress ${autoPlayInterval}ms linear forwards`,
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
