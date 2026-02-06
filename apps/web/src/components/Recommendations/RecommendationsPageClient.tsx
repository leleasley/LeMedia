"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HoverMediaCard } from "@/components/Media/HoverMediaCard";
import Link from "next/link";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(res => res.json());

type RecommendationItem = {
  id: number;
  title: string;
  posterUrl: string | null;
  year: string;
  rating: number;
  description: string;
  type: "movie" | "tv";
};

const ITEMS_PER_PAGE = 40;

export function RecommendationsPageClient() {
  const [page, setPage] = useState(0);
  const [prevPage, setPrevPage] = useState(0);
  const offset = page * ITEMS_PER_PAGE;
  
  const { data, error } = useSWR<{ items: RecommendationItem[]; hasMore: boolean }>(
    `/api/v1/recommendations?limit=${ITEMS_PER_PAGE}&offset=${offset}`,
    fetcher,
    { refreshInterval: 600000 }
  );

  const items = data?.items ?? [];
  const hasMore = data?.hasMore ?? false;
  const [loading, setLoading] = useState(true);
  const isPageChanging = page !== prevPage;
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

  useEffect(() => {
    if (!data && !error) return;
    setLoading(false);
    setPrevPage(page);
  }, [data, error, page]);

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

  if (loading || isPageChanging) {
    return (
      <div>
        <style>{`
          @keyframes shimmer {
            0% { background-position: -1000px 0; }
            100% { background-position: 1000px 0; }
          }
          .shimmer {
            background: linear-gradient(90deg, rgba(255,255,255,.1) 25%, rgba(255,255,255,.2) 50%, rgba(255,255,255,.1) 75%);
            background-size: 1000px 100%;
            animation: shimmer 2s infinite;
          }
        `}</style>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <div className="aspect-[2/3] bg-gray-800 rounded-lg shimmer" />
              <div className="mt-3 h-4 bg-gray-800 rounded w-3/4 shimmer" />
              <div className="mt-2 h-3 bg-gray-800 rounded w-1/2 shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-8 text-center">
        <p className="text-red-200">Unable to load recommendations.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-purple-500/5 p-12 text-center">
        <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center mb-6">
          <svg className="h-10 w-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        </div>
        <h3 className="text-2xl font-bold text-white mb-2">No recommendations yet</h3>
        <p className="text-gray-400 mb-8 max-w-sm mx-auto">
          Start by adding favorites, writing reviews, or watching content to get personalized suggestions tailored to your taste.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-3 text-sm font-medium text-white hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-blue-500/25"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          Browse Content
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-sm text-blue-300 font-medium">
          <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
          {items.length} {items.length === 1 ? "item" : "items"} (page {page + 1})
        </span>
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
            />
          ))}
        </div>
      )}

      {/* Pagination Controls */}
      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          onClick={() => setPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Previous
        </button>
        
        <span className="text-sm text-gray-400">
          Page <span className="font-semibold text-white">{page + 1}</span>
        </span>
        
        <button
          onClick={() => setPage(page + 1)}
          disabled={!hasMore}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
