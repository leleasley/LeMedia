"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EyeIcon as EyeIconOutline } from "@heroicons/react/24/outline";
import { EyeIcon as EyeIconSolid } from "@heroicons/react/24/solid";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { Modal } from "@/components/Common/Modal";

type Props = {
  items: Array<{
    tmdbId: number;
    title: string;
    hasReview?: boolean;
  }>;
};

export function CollectionWatchedBulkActions({ items }: Props) {
  const toast = useToast();
  const router = useRouter();
  const [loading, setLoading] = useState<"mark" | "clear" | null>(null);
  const [reviewPromptTarget, setReviewPromptTarget] = useState<{
    tmdbId: number;
    title: string;
    remainingCount: number;
  } | null>(null);

  const uniqueItems = useMemo(
    () => Array.from(
      new Map(
        items
          .filter((item) => Number.isFinite(item.tmdbId) && item.tmdbId > 0)
          .map((item) => [item.tmdbId, item])
      ).values()
    ),
    [items]
  );

  const uniqueIds = useMemo(() => uniqueItems.map((item) => item.tmdbId), [uniqueItems]);

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
            const res = await csrfFetch("/api/media-list", {
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

      if (method === "POST") {
        const nextReviewItem = uniqueItems.find((item) => !item.hasReview);
        if (nextReviewItem) {
          const remainingCount = uniqueItems.filter((item) => !item.hasReview && item.tmdbId !== nextReviewItem.tmdbId).length;
          setReviewPromptTarget({
            tmdbId: nextReviewItem.tmdbId,
            title: nextReviewItem.title,
            remainingCount,
          });
          return;
        }
      }

      router.refresh();
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
      <Modal
        open={reviewPromptTarget != null}
        onClose={() => {
          setReviewPromptTarget(null);
          router.refresh();
        }}
        title="Leave a review?"
        forceCenter
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-300">
            You marked this collection as watched. Want to review {reviewPromptTarget?.title ?? "the next title"} now?
          </p>
          {reviewPromptTarget && reviewPromptTarget.remainingCount > 0 ? (
            <p className="text-xs text-gray-400">
              After that, you still have {reviewPromptTarget.remainingCount} more watched title{reviewPromptTarget.remainingCount === 1 ? "" : "s"} in this collection without a review.
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setReviewPromptTarget(null);
                router.refresh();
              }}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white"
            >
              Maybe later
            </button>
            <button
              type="button"
              onClick={() => {
                if (!reviewPromptTarget) return;
                const tmdbId = reviewPromptTarget.tmdbId;
                setReviewPromptTarget(null);
                router.push(`/movie/${tmdbId}#reviews`);
              }}
              className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
            >
              Review now
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
