"use client";

import { useState } from "react";
import useSWR from "swr";
import { ThumbsUp } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { swrFetcher } from "@/lib/swr-fetcher";
import { cn } from "@/lib/utils";

interface UpvoteButtonProps {
  requestId: string;
  /** When true, renders smaller (for table/list rows) */
  compact?: boolean;
}

export function UpvoteButton({ requestId, compact = false }: UpvoteButtonProps) {
  const { data, mutate } = useSWR<{ count: number; voted: boolean }>(
    `/api/requests/${requestId}/upvote`,
    swrFetcher,
    { revalidateOnFocus: false }
  );
  const [submitting, setSubmitting] = useState(false);

  const count = data?.count ?? 0;
  const voted = data?.voted ?? false;

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (submitting) return;
    setSubmitting(true);
    await mutate(
      async () => {
        const res = await csrfFetch(`/api/requests/${requestId}/upvote`, {
          method: "POST",
        });
        return res.json() as Promise<{ count: number; voted: boolean }>;
      },
      {
        optimisticData: {
          count: voted ? Math.max(0, count - 1) : count + 1,
          voted: !voted,
        },
        rollbackOnError: true,
        revalidate: false,
      }
    );
    setSubmitting(false);
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      disabled={submitting}
      title={voted ? "Remove upvote" : "Upvote this request"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold transition-all duration-200",
        "disabled:opacity-60 disabled:cursor-not-allowed",
        voted
          ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30"
          : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80 hover:border-white/20",
        compact ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs"
      )}
    >
      <ThumbsUp
        className={cn(
          "shrink-0 transition-all duration-200",
          compact ? "h-3 w-3" : "h-3.5 w-3.5",
          voted && "fill-indigo-300"
        )}
      />
      <span>{count > 0 ? count : "0"}</span>
    </button>
  );
}
