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
        <div className="h-6 w-20 rounded-full bg-white/10 animate-pulse" />
      </div>
      <div className="flex gap-3 md:gap-5 overflow-hidden pb-4 -mx-3 px-3 md:mx-0 md:px-0">
        {Array.from({ length: count }).map((_, idx) => (
          <div
            key={`carousel-skeleton-${idx}`}
            className="flex-shrink-0 w-36 sm:w-40 md:w-44 lg:w-48"
          >
            <div className="relative aspect-[2/3] w-full rounded-xl bg-white/5 ring-1 ring-white/10 animate-pulse overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-white/0" />
              <div className="absolute bottom-2 left-2 h-2 w-10 rounded-full bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
