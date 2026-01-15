"use client";

import { RequestCardSkeleton } from "@/components/Common/Skeleton";

export default function RequestsLoading() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="h-10 w-48 bg-zinc-800 rounded animate-pulse" />
        <div className="mt-4 h-5 w-80 bg-zinc-800 rounded animate-pulse" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <RequestCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
