"use client";

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-white/10",
        className
      )}
    />
  );
}

export function MediaCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="aspect-[2/3] w-full rounded-xl" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function MediaGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 md:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: count }).map((_, i) => (
        <MediaCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function CarouselSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-[150px] md:w-[180px]">
            <MediaCardSkeleton />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailPageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Backdrop */}
      <Skeleton className="w-full h-[300px] md:h-[400px] rounded-none" />
      
      {/* Content */}
      <div className="px-4 md:px-8 space-y-6">
        {/* Title section */}
        <div className="flex gap-6">
          <Skeleton className="w-[150px] md:w-[200px] aspect-[2/3] rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-4 py-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-14 rounded-full" />
            </div>
            <Skeleton className="h-20 w-full" />
            <div className="flex gap-3">
              <Skeleton className="h-10 w-32 rounded-lg" />
              <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
          </div>
        </div>
        
        {/* Cast section */}
        <div className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[100px] space-y-2">
                <Skeleton className="w-full aspect-square rounded-full" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-2 w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function RequestCardSkeleton() {
  return (
    <div className="flex gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
      <Skeleton className="w-16 h-24 rounded-lg flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
    </div>
  );
}

export function RequestsListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <RequestCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 p-4 bg-white/5 border-b border-white/10">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b border-white/5 last:border-0">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Skeleton className="w-20 h-20 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
      
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-8 rounded" />
          <Skeleton className="h-8 w-16 rounded" />
          <Skeleton className="h-8 w-8 rounded" />
        </div>
      </div>
      
      {/* Calendar grid */}
      <div className="rounded-xl border border-white/10 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-white/5 border-b border-white/10">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="p-3">
              <Skeleton className="h-4 w-8 mx-auto" />
            </div>
          ))}
        </div>
        
        {/* Calendar cells */}
        {Array.from({ length: 5 }).map((_, weekIndex) => (
          <div key={weekIndex} className="grid grid-cols-7">
            {Array.from({ length: 7 }).map((_, dayIndex) => (
              <div key={dayIndex} className="min-h-[100px] p-2 border-r border-b border-white/5 last:border-r-0">
                <Skeleton className="h-6 w-6 rounded-full mb-2" />
                {Math.random() > 0.7 && <Skeleton className="h-5 w-full rounded mb-1" />}
                {Math.random() > 0.8 && <Skeleton className="h-5 w-full rounded" />}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SearchResultsSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <MediaGridSkeleton count={count} />
    </div>
  );
}
