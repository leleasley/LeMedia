"use client";

import { cn } from "@/lib/utils";

export function MediaCarouselSkeleton({
  title,
  count = 6,
  className,
}: {
  title: string;
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">{title}</h2>
        <div className="h-4 w-16 rounded bg-white/10 animate-pulse" />
      </div>
      <div className="flex gap-3 md:gap-5 overflow-hidden pb-4 -mx-3 px-3 md:mx-0 md:px-0">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={`carousel-skeleton-${idx}`}
            className="flex-shrink-0 w-32 sm:w-36 md:w-40"
          >
            <div className="relative aspect-[2/3] w-full rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
