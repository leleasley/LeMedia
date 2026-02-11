"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play, Plus } from "lucide-react";
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

export function DiscoverHeroCarousel({ 
  items, 
  autoPlayInterval = 6000 
}: DiscoverHeroCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const transitionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle next/previous with smooth transitions
  const handleNavigation = useCallback((direction: "next" | "prev") => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    transitionTimerRef.current = setTimeout(() => {
      setCurrentIndex(prev => {
        if (direction === "next") {
          return (prev + 1) % items.length;
        } else {
          return (prev - 1 + items.length) % items.length;
        }
      });
      // Keep transitioning state for smooth fade
      setTimeout(() => setIsTransitioning(false), 100);
    }, 500);
  }, [items.length, isTransitioning]);

  // Handle dot click
  const handleDotClick = useCallback((index: number) => {
    if (isTransitioning || index === currentIndex) return;
    setIsTransitioning(true);
    transitionTimerRef.current = setTimeout(() => {
      setCurrentIndex(index);
      setTimeout(() => setIsTransitioning(false), 100);
    }, 500);
  }, [isTransitioning, currentIndex]);

  // Auto-play carousel
  useEffect(() => {
    if (items.length <= 1) return;

    const resetAutoPlay = () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
      autoPlayTimerRef.current = setTimeout(() => {
        handleNavigation("next");
      }, autoPlayInterval);
    };

    resetAutoPlay();

    return () => {
      if (autoPlayTimerRef.current) {
        clearTimeout(autoPlayTimerRef.current);
      }
    };
  }, [currentIndex, autoPlayInterval, items.length, handleNavigation]);

  // Cleanup transition timer on unmount
  useEffect(() => {
    return () => {
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  if (!items.length) return null;

  const current = items[currentIndex];
  const href = current?.type === "tv" ? `/tv/${current.id}` : `/movie/${current.id}`;

  return (
    <div className="relative -mx-4 md:-mx-6 lg:-mx-8 overflow-hidden bg-black">
      {/* Hero Container - Full width and tall */}
      <div className="relative w-full aspect-video md:aspect-[16/6] lg:aspect-[21/9] bg-gray-900">
        {/* Background Image with smooth fade */}
        <div 
          key={currentIndex}
          className={cn(
            "absolute inset-0 transition-opacity duration-700 ease-in-out",
            isTransitioning ? "opacity-0" : "opacity-100"
          )}
        >
          {current?.backdropUrl ? (
            <Image
              src={current.backdropUrl}
              alt={current.title}
              fill
              className="object-cover"
              priority
              quality={90}
            />
          ) : current?.posterUrl ? (
            <Image
              src={current.posterUrl}
              alt={current.title}
              fill
              className="object-cover"
              priority
              quality={90}
            />
          ) : null}
        </div>

        {/* Gradient Blend Overlay - Same as media pages */}
        <div className="absolute inset-0 media-page-gradient" />

        {/* Content Overlay */}
        <div
          key={`content-${currentIndex}`}
          className={cn(
            "absolute inset-0 flex flex-col justify-between px-4 py-6 md:px-8 md:py-8 lg:px-12 lg:py-10 transition-opacity duration-700 ease-in-out",
            isTransitioning ? "opacity-0" : "opacity-100"
          )}
        >
          {/* Top Spacer */}
          <div />

          {/* Bottom Content */}
          <div className="space-y-4 md:space-y-6 max-w-3xl">
            {/* Title */}
            <div className="space-y-3">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white drop-shadow-lg leading-tight">
                {current.title}
              </h1>

              {/* Year, Rating, and Badges */}
              <div className="flex items-center gap-4 text-sm md:text-base text-gray-100 flex-wrap">
                {current.year && (
                  <span className="font-semibold">{current.year}</span>
                )}
                {current.rating && current.rating > 0 && (
                  <>
                    <span className="opacity-70">•</span>
                    <span className="flex items-center gap-1 font-semibold">
                      <span className="text-yellow-400">★</span>
                      {current.rating.toFixed(1)}
                    </span>
                  </>
                )}
              </div>

              {/* External Ratings - Server-side rendered */}
              {current.externalRatings && (
                <div className="flex items-center gap-3 flex-wrap pt-1">
                  {/* Rotten Tomatoes - Critics Score */}
                  {typeof current.externalRatings.criticsScore === 'number' && (
                    <Link
                      href={current.externalRatings.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="media-rating px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                      title={`Rotten Tomatoes Critics: ${current.externalRatings.criticsScore}%`}
                    >
                      <div className="w-5 h-5 sm:w-6 sm:h-6 relative">
                        <Image
                          src={current.externalRatings.criticsScore >= 60 ? rtFreshLogo : rtRottenLogo}
                          alt="RT Critics"
                          fill
                          className="object-contain"
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-white">{current.externalRatings.criticsScore}%</span>
                    </Link>
                  )}

                  {/* Rotten Tomatoes - Audience Score */}
                  {typeof current.externalRatings.audienceScore === 'number' && (
                    <Link
                      href={current.externalRatings.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="media-rating px-1 sm:px-2 py-1.5 sm:py-2 rounded-lg hover:bg-white/5 transition-all"
                      title={`Rotten Tomatoes Audience: ${current.externalRatings.audienceScore}%`}
                    >
                      <div className="w-5 h-5 sm:w-6 sm:h-6 relative">
                        <Image
                          src={current.externalRatings.audienceScore >= 60 ? rtAudFreshLogo : rtAudRottenLogo}
                          alt="RT Audience"
                          fill
                          className="object-contain"
                        />
                      </div>
                      <span className="text-xs sm:text-sm font-bold text-white">{current.externalRatings.audienceScore}%</span>
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Description */}
            {current.overview && (
              <p className="text-sm md:text-base lg:text-lg text-gray-100 line-clamp-3 md:line-clamp-4 opacity-90 max-w-2xl leading-relaxed">
                {current.overview}
              </p>
            )}

            {/* Action Button */}
            <div className="flex items-center gap-3 pt-2">
              <PrefetchLink href={href}>
                <button className="group flex items-center gap-3 px-8 md:px-10 py-4 md:py-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl transition-all duration-300 active:scale-95 shadow-2xl hover:shadow-purple-500/50 text-base md:text-lg border border-purple-400/20">
                  <Play className="h-5 w-5 md:h-6 md:w-6 transition-transform group-hover:scale-110" fill="currentColor" />
                  <span>More Info</span>
                </button>
              </PrefetchLink>
            </div>
          </div>
        </div>

        {/* Navigation Controls - Hide on very small screens */}
        {items.length > 1 && (
          <>
            {/* Left Arrow */}
            <button
              onClick={() => handleNavigation("prev")}
              disabled={isTransitioning}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-1.5 md:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 disabled:opacity-50 backdrop-blur-sm"
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4 md:h-6 md:w-6" />
            </button>

            {/* Right Arrow */}
            <button
              onClick={() => handleNavigation("next")}
              disabled={isTransitioning}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-1.5 md:p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all active:scale-95 disabled:opacity-50 backdrop-blur-sm"
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4 md:h-6 md:w-6" />
            </button>

            {/* Dots */}
            <div className="absolute bottom-4 md:bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
              {items.map((_, index) => (
                <button
                  key={index}
                  onClick={() => handleDotClick(index)}
                  disabled={isTransitioning}
                  className={cn(
                    "h-2 rounded-full transition-all disabled:cursor-not-allowed",
                    currentIndex === index
                      ? "bg-white w-8"
                      : "bg-white/50 hover:bg-white/70 w-2"
                  )}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
