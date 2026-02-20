"use client";

import useSWR from "swr";
import { swrFetcher } from "@/lib/swr-fetcher";
import { CommentsListForm } from "@/components/Requests/CommentsListForm";
import { MessageSquare } from "lucide-react";

interface RequestCommentsSectionProps {
  tmdbId: number;
  mediaType: "movie" | "tv";
  currentUsername?: string;
  isAdmin?: boolean;
  /** If you already have the requestId, pass it directly to skip the lookup. */
  requestId?: string | null;
}

/**
 * Looks up the active request for a given tmdbId/mediaType then renders
 * CommentsListForm. Pass `requestId` directly to skip the SWR lookup.
 */
export function RequestCommentsSection({
  tmdbId,
  mediaType,
  currentUsername,
  isAdmin = false,
  requestId: requestIdProp,
}: RequestCommentsSectionProps) {
  const { data, isLoading } = useSWR<{ requestId: string | null }>(
    requestIdProp === undefined
      ? `/api/v1/requests/for-media?tmdbId=${tmdbId}&mediaType=${mediaType}`
      : null,
    swrFetcher,
    { revalidateOnFocus: false }
  );

  const resolvedRequestId = requestIdProp ?? data?.requestId ?? null;

  if (isLoading) {
    return (
      <div className="pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <MessageSquare className="h-3.5 w-3.5" />
          <span>Loading comments…</span>
        </div>
      </div>
    );
  }

  if (!resolvedRequestId) return null;

  return (
    <div className="pt-4 border-t border-white/10">
      <CommentsListForm
        requestId={resolvedRequestId}
        currentUsername={currentUsername}
        isAdmin={isAdmin}
      />
    </div>
  );
}
