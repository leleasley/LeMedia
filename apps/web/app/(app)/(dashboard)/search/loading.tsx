"use client";

import { SearchResultsSkeleton } from "@/components/Common/Skeleton";

export default function SearchLoading() {
  return (
    <div className="space-y-4 md:space-y-8 px-3 md:px-8 pb-4 md:pb-8">
      <div>
        <div className="h-8 md:h-10 w-48 bg-zinc-800 rounded animate-pulse" />
        <div className="mt-2 h-5 w-64 bg-zinc-800 rounded animate-pulse" />
      </div>
      <SearchResultsSkeleton count={12} />
    </div>
  );
}
