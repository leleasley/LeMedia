"use client";

import { useMemo, useState } from "react";
import { EyeIcon as EyeIconOutline } from "@heroicons/react/24/outline";
import { EyeIcon as EyeIconSolid } from "@heroicons/react/24/solid";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";

type Props = {
  movieIds: number[];
};

export function CollectionWatchedBulkActions({ movieIds }: Props) {
  const toast = useToast();
  const [loading, setLoading] = useState<"mark" | "clear" | null>(null);

  const uniqueIds = useMemo(
    () => Array.from(new Set(movieIds.filter((value) => Number.isFinite(value) && value > 0))),
    [movieIds]
  );

  async function applyWatched(method: "POST" | "DELETE") {
    if (!uniqueIds.length || loading) return;
    setLoading(method === "POST" ? "mark" : "clear");
    const listType = "watched";
    try {
      const chunkSize = 25;
      for (let index = 0; index < uniqueIds.length; index += chunkSize) {
        const chunk = uniqueIds.slice(index, index + chunkSize);
        await Promise.all(
          chunk.map(async (tmdbId) => {
            const res = await csrfFetch("/api/v1/media-list", {
              method,
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ listType, mediaType: "movie", tmdbId }),
            });
            if (!res.ok) {
              throw new Error("request_failed");
            }
          })
        );
      }

      toast.success(
        method === "POST"
          ? `Marked ${uniqueIds.length} title${uniqueIds.length === 1 ? "" : "s"} as watched`
          : `Cleared watched state for ${uniqueIds.length} title${uniqueIds.length === 1 ? "" : "s"}`,
        { timeoutMs: 3500 }
      );
      window.location.reload();
    } catch {
      toast.error("Unable to update watched state for this collection", { timeoutMs: 3500 });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void applyWatched("POST")}
        disabled={loading != null || uniqueIds.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <EyeIconSolid className="h-3.5 w-3.5" />
        {loading === "mark" ? "Marking..." : "Mark all watched"}
      </button>
      <button
        type="button"
        onClick={() => void applyWatched("DELETE")}
        disabled={loading != null || uniqueIds.length === 0}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <EyeIconOutline className="h-3.5 w-3.5" />
        {loading === "clear" ? "Clearing..." : "Mark all unwatched"}
      </button>
    </div>
  );
}
