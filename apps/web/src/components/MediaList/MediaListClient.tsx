"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HoverMediaCard } from "@/components/Media/HoverMediaCard";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMediaQuery } from "@/hooks/useMediaQuery";

type MediaItem = {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
  rating: number;
  description: string;
  type: "movie" | "tv";
};

export function MediaListClient({ listType }: { listType: "favorite" | "watchlist" }) {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isSm = useMediaQuery("(min-width: 640px)", false);
  const isMd = useMediaQuery("(min-width: 768px)", false);
  const isLg = useMediaQuery("(min-width: 1024px)", false);
  const isXl = useMediaQuery("(min-width: 1280px)", false);
  const parentRef = useRef<HTMLElement | null>(null);

  const columns = useMemo(() => {
    if (isXl) return 6;
    if (isLg) return 5;
    if (isMd) return 4;
    if (isSm) return 3;
    return 2;
  }, [isSm, isMd, isLg, isXl]);

  useEffect(() => {
    parentRef.current = document.querySelector("main");
  }, []);

  const rowCount = Math.ceil(items.length / columns);
  const useVirtual = items.length > 60;
  // TanStack Virtual returns functions that React Compiler can't memoize safely.
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current ?? document.scrollingElement,
    estimateSize: () => 360,
    overscan: 2
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rowVirtualizer, columns, items.length]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetch(`/api/v1/media-list?listType=${listType}&take=50`, { credentials: "include" })
      .then(async res => {
        if (!res.ok) {
          throw new Error("Failed to load list");
        }
        return res.json();
      })
      .then(data => {
        if (!active) return;
        setItems(data.items || []);
      })
      .catch(err => {
        if (!active) return;
        setError(err?.message ?? "Unable to load list");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listType]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[2/3] bg-gray-800 rounded-lg" />
            <div className="mt-2 h-4 bg-gray-800 rounded w-3/4" />
            <div className="mt-1 h-3 bg-gray-800 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-8 text-center">
        <p className="text-red-200">{error}</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-12 text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          {listType === "favorite" ? (
            <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          ) : (
            <svg className="h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          )}
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          {listType === "favorite" ? "No favorites yet" : "No watchlist items"}
        </h3>
        <p className="text-sm text-gray-400 mb-6">
          {listType === "favorite"
            ? "Start adding your favorite movies and TV shows"
            : "Add movies and TV shows you want to watch"}
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Browse Content
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 text-sm text-gray-400">
        {items.length} {items.length === 1 ? "item" : "items"}
      </div>

      {useVirtual ? (
        <div className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const startIndex = virtualRow.index * columns;
            const rowItems = items.slice(startIndex, startIndex + columns);
            return (
              <div
                key={virtualRow.key}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {rowItems.map((item) => (
                    <HoverMediaCard
                      key={`${item.type}-${item.id}`}
                      id={item.id}
                      title={item.title}
                      posterUrl={item.posterUrl}
                      href={`/${item.type}/${item.id}`}
                      year={item.year}
                      rating={item.rating}
                      description={item.description}
                      mediaType={item.type}
                      cardMode="requestable"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => (
            <HoverMediaCard
              key={`${item.type}-${item.id}`}
              id={item.id}
              title={item.title}
              posterUrl={item.posterUrl}
              href={`/${item.type}/${item.id}`}
              year={item.year}
              rating={item.rating}
              description={item.description}
              mediaType={item.type}
              cardMode="requestable"
            />
          ))}
        </div>
      )}
    </div>
  );
}
