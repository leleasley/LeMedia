"use client";

import { Fragment, useMemo, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Loader2, MessageSquare, Reply, Send, Trash2, X } from "lucide-react";
import { csrfFetch } from "@/lib/csrf-client";
import { formatDate } from "@/lib/dateFormat";
import { logger } from "@/lib/logger";
import { swrFetcher } from "@/lib/swr-fetcher";
import { cn } from "@/lib/utils";
import { getAvatarAlt, getAvatarSrc, shouldBypassNextImage } from "@/lib/avatar";
import { useToast } from "@/components/Providers/ToastProvider";

type ReviewComment = {
  id: number;
  reviewId: number;
  userId: number;
  parentId: number | null;
  content: string;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  replyCount: number;
  user: {
    id: number;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    avatarVersion: number | null;
    jellyfinUserId: string | null;
  };
};

type CommentsResponse = {
  comments: ReviewComment[];
  totalCount: number;
};

type ReviewCommentsThreadProps = {
  reviewId: number;
  currentUserId?: number;
  isAdmin?: boolean;
};

function renderContentWithMentions(content: string) {
  const parts = content.split(/(@[a-zA-Z0-9._-]{2,32})/g);
  return parts.map((part, index) => {
    if (/^@[a-zA-Z0-9._-]{2,32}$/.test(part)) {
      return (
        <span key={`mention-${index}`} className="font-medium text-sky-300">
          {part}
        </span>
      );
    }
    return <Fragment key={`text-${index}`}>{part}</Fragment>;
  });
}

export function ReviewCommentsThread({ reviewId, currentUserId, isAdmin = false }: ReviewCommentsThreadProps) {
  const toast = useToast();
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<ReviewComment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const { data, isLoading, mutate } = useSWR<CommentsResponse>(
    `/api/v1/reviews/review/${reviewId}/comments`,
    swrFetcher,
    {
      revalidateOnFocus: false,
      onError: (error) => {
        logger.error("[ReviewCommentsThread] Failed to load comments", error);
      },
    }
  );

  const comments = useMemo(() => data?.comments ?? [], [data?.comments]);

  const commentsByParent = useMemo(() => {
    const grouped = new Map<number | null, ReviewComment[]>();
    for (const comment of comments) {
      const key = comment.parentId;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(comment);
    }

    for (const entry of grouped.values()) {
      entry.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    return grouped;
  }, [comments]);

  const totalCount = data?.totalCount ?? comments.length;

  const handleReply = (comment: ReviewComment) => {
    setReplyTo(comment);
    if (!content.trim()) {
      setContent(`@${comment.user.username} `);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setSubmitting(true);
    try {
      const response = await csrfFetch(`/api/v1/reviews/review/${reviewId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          parentId: replyTo?.id,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unable to post comment" }));
        toast.error(payload.error || "Unable to post comment");
        return;
      }

      setContent("");
      setReplyTo(null);
      await mutate();
    } catch (error) {
      logger.error("[ReviewCommentsThread] Failed to submit comment", error);
      toast.error("Unable to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    setDeletingId(commentId);
    try {
      const response = await csrfFetch(`/api/v1/reviews/review/${reviewId}/comments/${commentId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: "Unable to delete comment" }));
        toast.error(payload.error || "Unable to delete comment");
        return;
      }

      await mutate();
    } catch (error) {
      logger.error("[ReviewCommentsThread] Failed to delete comment", error);
      toast.error("Unable to delete comment");
    } finally {
      setDeletingId(null);
    }
  };

  const renderTree = (parentId: number | null, depth = 0) => {
    const branch = commentsByParent.get(parentId) ?? [];
    return branch.map((comment) => {
      const displayName = comment.user.displayName || comment.user.username;
      const avatarSrc = getAvatarSrc({
        avatarUrl: comment.user.avatarUrl,
        jellyfinUserId: comment.user.jellyfinUserId,
        displayName,
        username: comment.user.username,
      });
      const avatarAlt = getAvatarAlt({ displayName, username: comment.user.username });
      const canDelete = isAdmin || (currentUserId != null && currentUserId === comment.userId);
      const hasChildren = (commentsByParent.get(comment.id) ?? []).length > 0;

      return (
        <div key={comment.id} className={cn(depth > 0 && "ml-6 border-l border-white/10 pl-4") }>
          <div className="group mt-2 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-start gap-3">
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                <Image
                  src={avatarSrc}
                  alt={avatarAlt}
                  fill
                  className="object-cover"
                  unoptimized={shouldBypassNextImage(avatarSrc)}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-white">{displayName}</span>
                  <span className="text-gray-400">{formatDate(comment.createdAt)}</span>
                  {comment.edited && <span className="text-[10px] text-gray-500">edited</span>}
                </div>

                <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-gray-200">
                  {renderContentWithMentions(comment.content)}
                </p>

                <div className="mt-2 flex items-center gap-3 text-[11px]">
                  <button
                    type="button"
                    onClick={() => handleReply(comment)}
                    className="inline-flex items-center gap-1 text-gray-400 hover:text-white"
                  >
                    <Reply className="h-3 w-3" />
                    Reply
                  </button>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(comment.id)}
                      disabled={deletingId === comment.id}
                      className="inline-flex items-center gap-1 text-gray-500 hover:text-red-300 disabled:opacity-50"
                    >
                      {deletingId === comment.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {hasChildren ? renderTree(comment.id, depth + 1) : null}
        </div>
      );
    });
  };

  return (
    <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-gray-200">
          <MessageSquare className="h-3.5 w-3.5 text-gray-400" />
          Comments {totalCount > 0 ? `(${totalCount})` : ""}
        </div>
      </div>

      <div className="mt-2 max-h-80 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-4 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="rounded-md border border-dashed border-white/10 p-3 text-xs text-gray-400">
            No comments yet.
          </div>
        ) : (
          <div>{renderTree(null)}</div>
        )}
      </div>

      {replyTo && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
          <span>
            Replying to @{replyTo.user.username}
          </span>
          <button
            type="button"
            onClick={() => setReplyTo(null)}
            className="text-sky-100/80 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={replyTo ? `Reply to @${replyTo.user.username}...` : "Add a comment..."}
          disabled={submitting}
          rows={2}
          maxLength={2000}
          className="w-full resize-none rounded-md border border-white/10 bg-white/5 p-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-white/20"
        />
        <button
          type="submit"
          disabled={submitting || !content.trim()}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-indigo-600 px-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </button>
      </form>
    </div>
  );
}
