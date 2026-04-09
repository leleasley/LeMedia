"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { SearchHeader } from "@/components/Layout/SearchHeader";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import rtFreshLogo from "@/assets/rt_fresh.svg";
import rtRottenLogo from "@/assets/rt_rotten.svg";
import rtAudFreshLogo from "@/assets/rt_aud_fresh.svg";
import rtAudRottenLogo from "@/assets/rt_aud_rotten.svg";
import tmdbLogo from "@/assets/tmdb_logo.svg";

export interface HeroCarouselItem {
  id: number;
  title: string;
  overview?: string;
  backdropUrl: string | null;
  posterUrl: string | null;
  rating?: number;
  year?: string;
  type?: "movie" | "tv";
  logoUrl?: string | null;
  mobileRank?: number;
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
  mobileItems?: HeroCarouselItem[];
  autoPlayInterval?: number;
  isAdmin?: boolean;
  profile?: {
    username: string;
    displayName?: string | null;
    email: string | null;
    avatarUrl?: string | null;
    avatarVersion?: number | null;
    jellyfinUserId?: string | null;
  } | null;
}

const SWIPE_THRESHOLD = 50;

export function DiscoverHeroCarousel({
  items,
  mobileItems,
  autoPlayInterval = 6000,
  isAdmin = false,
  profile = null,
}: DiscoverHeroCarouselProps) {
  const isMobileViewport = useMediaQuery("(max-width: 767px)", false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [progressKey, setProgressKey] = useState(0);
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch RT ratings client-side so they don't block SSR
  const [ratingsMap, setRatingsMap] = useState<Record<string, HeroCarouselItem["externalRatings"]>>({});
  useEffect(() => {
    if (!items.length) return;
    let cancelled = false;
    items.forEach((item) => {
      if (!item.type || !item.id) return;
      fetch(`/api/v1/ratings/${item.type}/${item.id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (cancelled || !data?.ratings) return;
          const r = data.ratings;
          if (r.rtCriticsScore == null && r.rtAudienceScore == null) return;
          setRatingsMap((prev) => ({
            ...prev,
            [`${item.type}:${item.id}`]: {
              title: item.title,
              url: r.rtUrl ?? "",
              criticsRating: r.rtCriticsRating ?? undefined,
              criticsScore: r.rtCriticsScore ?? undefined,
              audienceRating: r.rtAudienceRating ?? undefined,
              audienceScore: r.rtAudienceScore ?? undefined,
            },
          }));
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, [items]);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );
  const mobileSlides = mobileItems?.length ? mobileItems : items;
  const activeSlides = isMobileViewport ? mobileSlides : items;
  const activeSlideCount = Math.max(activeSlides.length, 1);

  const goToSlide = useCallback(
    (nextIndex: number, direction: 1 | -1 = 1) => {
      const normalizedIndex = ((nextIndex % activeSlideCount) + activeSlideCount) % activeSlideCount;
      if (normalizedIndex === currentIndex || isTransitioning) return;

      setIsTransitioning(true);
      setSlideDirection(direction);
      setCurrentIndex(normalizedIndex);
      setProgressKey((k) => k + 1);

      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
      transitionTimerRef.current = setTimeout(() => {
        setDisplayIndex(normalizedIndex);
        setIsTransitioning(false);
      }, 900);
    },
    [activeSlideCount, currentIndex, isTransitioning]
  );

  const handleNavigation = useCallback(
    (direction: "next" | "prev") => {
      if (isTransitioning) return;
      const nextIndex =
        direction === "next"
          ? (currentIndex + 1) % activeSlideCount
          : (currentIndex - 1 + activeSlideCount) % activeSlideCount;
      goToSlide(nextIndex, direction === "next" ? 1 : -1);
    },
    [activeSlideCount, currentIndex, isTransitioning, goToSlide]
  );

  const handleDotClick = useCallback(
    (index: number) => {
      const direction = index > currentIndex ? 1 : -1;
      goToSlide(index, direction);
    },
    [currentIndex, goToSlide]
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
    if (activeSlideCount <= 1) return;

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
  }, [activeSlideCount, currentIndex, autoPlayInterval, handleNavigation]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) clearTimeout(transitionTimerRef.current);
    };
  }, []);

  if (!items.length) return null;

  const current = items[currentIndex % items.length];

  const renderTitle = (
    item: HeroCarouselItem,
    className: string,
    logoClassName: string,
    priority = false
  ) => {
    if (item.logoUrl) {
      return (
        <div className={logoClassName}>
          <Image
            src={item.logoUrl}
            alt={`${item.title} logo`}
            fill
            className="object-contain object-left"
            sizes="(max-width: 767px) 75vw, 40vw"
            unoptimized
            priority={priority}
          />
        </div>
      );
    }

    return <h1 className={className}>{item.title}</h1>;
  };

  const renderMobileCard = (item: HeroCarouselItem, index: number) => {
    const isActive = index === (currentIndex % mobileSlides.length);
    const wasActive = index === (displayIndex % mobileSlides.length);
    const distanceFromCurrent = Math.abs(index - (currentIndex % mobileSlides.length));
    const preloadLogo = distanceFromCurrent <= 1 || (currentIndex === 0 && index === mobileSlides.length - 1);

    const activeClasses = isActive
      ? "translate-x-0 opacity-100"
      : wasActive
        ? slideDirection === 1
          ? "-translate-x-10 opacity-0"
          : "translate-x-10 opacity-0"
        : index > (currentIndex % mobileSlides.length)
          ? "translate-x-14 opacity-0"
          : "-translate-x-14 opacity-0";

    return (
      <PrefetchLink
        key={`mobile-card-${item.id}`}
        href={item.type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`}
        className={cn(
          "absolute inset-x-0 bottom-0 block transition-all duration-[900ms] ease-in-out md:hidden",
          activeClasses,
          isActive ? "z-[12] pointer-events-auto" : "z-[11] pointer-events-none"
        )}
        aria-hidden={!isActive}
        tabIndex={isActive ? 0 : -1}
      >
        <div className="mx-1 px-4 pb-5 pt-4 sm:px-5 sm:pb-6 sm:pt-5">
          <div className="flex items-end gap-4">
            <div className="flex flex-col items-start gap-2">
              <span className="rounded-full bg-black/24 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-white/82">
                {item.type === "tv" ? "Series" : "Movie"}
              </span>
              <div className="text-[5.25rem] font-black leading-none tracking-[-0.08em] text-white/94 drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)] [text-shadow:_0_4px_12px_rgba(0,0,0,0.85)] sm:text-[6rem]">
                {item.mobileRank ?? index + 1}
              </div>
            </div>

            <div className="min-w-0 flex-1 pb-3 drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
              {renderTitle(
                item,
                "text-2xl font-bold leading-tight text-white",
                "relative h-24 w-full max-w-[18rem] sm:h-28 sm:max-w-[21rem]",
                preloadLogo
              )}
            </div>
          </div>
        </div>
      </PrefetchLink>
    );
  };

  const renderDesktopContent = (item: HeroCarouselItem, index: number) => {
    const isActive = index === (currentIndex % items.length);
    const wasActive = index === (displayIndex % items.length);
    const distanceFromCurrent = Math.abs(index - (currentIndex % items.length));
    const preloadLogo = distanceFromCurrent <= 1 || (currentIndex === 0 && index === items.length - 1);

    if (!isActive && !wasActive) return null;

    const contentClasses = isActive
      ? "translate-x-0 opacity-100"
      : slideDirection === 1
        ? "-translate-x-8 opacity-0"
        : "translate-x-8 opacity-0";

    const ratings = item.externalRatings ?? ratingsMap[`${item.type}:${item.id}`];

    return (
      <div
        key={`desktop-content-${item.id}`}
        className={cn(
          "absolute inset-0 hidden max-w-3xl transition-all duration-[900ms] ease-in-out md:block",
          contentClasses,
          isActive ? "z-[11]" : "z-[10]"
        )}
      >
        <div className="space-y-4 md:space-y-6">
          <div className="space-y-3">
            <span className="inline-flex rounded-full bg-black/24 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-white/82">
              {item.type === "tv" ? "Series" : "Movie"}
            </span>

            {renderTitle(
              item,
              "text-4xl md:text-5xl lg:text-6xl font-bold text-white drop-shadow-lg leading-tight",
              "relative h-24 w-full max-w-[32rem] lg:h-28 lg:max-w-[36rem]",
              preloadLogo
            )}

            <div className="flex items-center gap-4 text-sm md:text-base text-gray-100 flex-wrap">
              {item.year && (
                <span className="font-semibold">{item.year}</span>
              )}
              {item.rating && item.rating > 0 && (
                <>
                  <span className="opacity-70">&bull;</span>
                  <span className="flex items-center gap-1 font-semibold">
                    <span className="text-yellow-400">★</span>
                    {item.rating.toFixed(1)}
                  </span>
                </>
              )}
            </div>

            {ratings ? (
              <div className="flex items-center gap-3 flex-wrap pt-1">
                {typeof ratings.criticsScore === "number" && (
                  <Link
                    href={ratings.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="media-rating px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                    title={`Rotten Tomatoes Critics: ${ratings.criticsScore}%`}
                  >
                    <div className="relative h-5 w-5 sm:h-6 sm:w-6">
                      <Image
                        src={ratings.criticsScore >= 60 ? rtFreshLogo : rtRottenLogo}
                        alt="RT Critics"
                        fill
                        className="object-contain"
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-white">
                      {ratings.criticsScore}%
                    </span>
                  </Link>
                )}

                {typeof ratings.audienceScore === "number" && (
                  <Link
                    href={ratings.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="media-rating px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                    title={`Rotten Tomatoes Audience: ${ratings.audienceScore}%`}
                  >
                    <div className="relative h-5 w-5 sm:h-6 sm:w-6">
                      <Image
                        src={ratings.audienceScore >= 60 ? rtAudFreshLogo : rtAudRottenLogo}
                        alt="RT Audience"
                        fill
                        className="object-contain"
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-white">
                      {ratings.audienceScore}%
                    </span>
                  </Link>
                )}
              </div>
            ) : null}
          </div>

          {item.overview && (
            <p className="text-sm md:text-base lg:text-lg text-gray-100 line-clamp-3 md:line-clamp-4 opacity-90 max-w-2xl leading-relaxed">
              {item.overview}
            </p>
          )}

        </div>
      </div>
    );
  };

  return (
    <div
      className="discover-hero relative overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <style>{`@keyframes hero-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}</style>
      <div className="relative w-full h-[80svh] min-h-[40rem] md:min-h-[70vh] lg:min-h-[74vh] xl:min-h-[78vh]">
        {/* Desktop slide images */}
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
                "absolute inset-0 hidden transition-opacity duration-[900ms] ease-in-out md:block",
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

        {/* Mobile slide images use the mobile slide order so logos match their backdrop */}
        {mobileSlides.map((item, index) => {
          const imgSrc = item.backdropUrl ?? item.posterUrl;
          if (!imgSrc) return null;

          const isActive = index === (currentIndex % mobileSlides.length);
          const wasActive = index === (displayIndex % mobileSlides.length);
          const shouldRender = isActive || wasActive;

          if (!shouldRender) return null;

          return (
            <div
              key={`mobile-${item.id}`}
              className={cn(
                "absolute inset-0 transition-opacity duration-[900ms] ease-in-out md:hidden",
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

        {/* Top gradient for white text readability against light images */}
        <div className="absolute inset-x-0 top-0 h-48 z-[2] pointer-events-none bg-gradient-to-b from-black/60 to-transparent" />

        {/* Global fade to true app background to eliminate any blue tint mismatches */}
        <div className="absolute inset-0 z-[2] pointer-events-none bg-gradient-to-b from-transparent from-65% via-[#0b1120]/80 to-[#0b1120]" />

        <div className="absolute left-0 right-0 top-0 z-[11] px-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6 md:hidden">
          <SearchHeader isAdmin={isAdmin} initialProfile={profile} />
          <div className="mt-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-white/55">
                Discover
              </p>
              <p className="mt-1 text-2xl font-bold text-white">
                TMDB Trending Media
              </p>
            </div>
            <div className="relative h-8 w-8 flex-shrink-0">
              <Image src={tmdbLogo} alt="TMDB" fill className="object-contain" priority />
            </div>
          </div>
        </div>

        {/* Content Overlay */}
        <div className="absolute inset-0 z-10 flex flex-col justify-end px-4 pb-8 pt-[calc(env(safe-area-inset-top)+8.75rem)] sm:px-6 sm:pb-10 sm:pt-[calc(env(safe-area-inset-top)+9.25rem)] md:px-10 md:pb-10 md:pt-24 lg:px-14 lg:pb-12 lg:pt-28">
          <div className="relative hidden max-w-3xl md:block min-h-[24rem]">
            {items.map((item, index) => renderDesktopContent(item, index))}
          </div>

          <div className="md:hidden">
            <div className="relative min-h-[20rem] px-1 pb-5 pt-10 sm:min-h-[23rem]">
              {mobileSlides.map((item, index) => renderMobileCard(item, index))}
            </div>
          </div>
        </div>

        {/* Navigation Controls */}
        {activeSlideCount > 1 && (
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
            <div className="absolute bottom-7 left-1/2 z-20 hidden -translate-x-1/2 items-center gap-1.5 md:flex md:bottom-7">
              {activeSlides.map((_, index) => (
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
