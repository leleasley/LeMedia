"use client";

import { useEffect, useState } from "react";
import { HardDrive, Loader2 } from "lucide-react";

interface LibraryStatusBadgeProps {
  type: "movie" | "tv";
  tmdbId: number;
}

export function LibraryStatusBadge({ type, tmdbId }: LibraryStatusBadgeProps) {
  const [status, setStatus] = useState<{
    inLibrary: boolean;
    name?: string;
    itemId?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkLibrary = async () => {
      try {
        const response = await fetch(
          `/api/library/status?type=${type}&tmdbId=${tmdbId}`
        );
        const data = await response.json();
        setStatus(data);
      } catch (err) {
        console.error("Error checking library status:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkLibrary();
  }, [type, tmdbId]);

  if (isLoading) {
    return null;
  }

  if (!status) {
    return null;
  }

  if (status.inLibrary) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-100 text-xs font-semibold border border-emerald-500/40">
        <HardDrive className="h-3 w-3" />
        <span>In Library</span>
      </div>
    );
  }

  return null;
}
