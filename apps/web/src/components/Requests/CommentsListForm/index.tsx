"use client";

import { useState } from "react";
import useSWR from "swr";
import { Send, Loader2, Trash2, MessageSquare } from "lucide-react";
import Image from "next/image";
import { formatDate } from "@/lib/dateFormat";
import { useToast } from "@/components/Providers/ToastProvider";
import { swrFetcher } from "@/lib/swr-fetcher";
import { logger } from "@/lib/logger";

interface Comment {
  id: number;
  comment: string;
  isAdminComment: boolean;
  createdAt: string;
  user: {
    id: number;
    username: string;
    avatarUrl: string | null;
    groups: string[];
  };
}

interface CommentsListFormProps {
  requestId: string;
  /** Username of the currently logged-in user — used to show delete button on own comments. */
  currentUsername?: string;
  /** Set to true for admin views so all comments can be deleted. */
  isAdmin?: boolean;
}

export function CommentsListForm({
  requestId,
  currentUsername,
  isAdmin = false,
}: CommentsListFormProps) {
  const { data, isLoading, mutate } = useSWR<{ comments: Comment[] }>(
    `/api/requests/${requestId}/comments`,
    swrFetcher
  );
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const toast = useToast();

  const getCsrfToken = () => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta?.getAttribute("content") ?? "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/requests/${requestId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify({ comment }),
      });

      if (response.ok) {
        setComment("");
        mutate();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to add comment");
      }
    } catch (err) {
      logger.error("[Comments] Error submitting comment", err);
      toast.error("Failed to add comment");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (commentId: number) => {
    setDeletingId(commentId);
    try {
      const response = await fetch(
        `/api/requests/${requestId}/comments/${commentId}`,
        {
          method: "DELETE",
          headers: { "X-CSRF-Token": getCsrfToken() },
        }
      );

      if (response.ok) {
        mutate();
      } else {
        const error = await response.json();
        toast.error(error.error || "Failed to delete comment");
      }
    } catch (err) {
      logger.error("[Comments] Error deleting comment", err);
      toast.error("Failed to delete comment");
    } finally {
      setDeletingId(null);
    }
  };

  const canDelete = (c: Comment) =>
    isAdmin || (currentUsername != null && c.user.username === currentUsername);

  const comments = data?.comments ?? [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-white">
          Comments{comments.length > 0 ? ` (${comments.length})` : ""}
        </h3>
      </div>

      {/* Comments List */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-6 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-xs">
            No comments yet. Be the first to leave one!
          </div>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="group relative glass-strong rounded-lg p-3 border border-white/10 hover:border-white/20 transition-colors"
            >
              <div className="flex gap-3">
                {/* Avatar */}
                {c.user.avatarUrl ? (
                  <div className="relative w-7 h-7 rounded-full overflow-hidden shrink-0">
                    <Image
                      src={c.user.avatarUrl}
                      alt={c.user.username}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0 text-xs font-bold text-white">
                    {c.user.username.charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-white text-xs">
                      {c.user.username}
                    </span>
                    {c.isAdminComment && (
                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-200 text-[10px] rounded font-semibold border border-amber-500/30">
                        Admin
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 ml-auto">
                      {formatDate(c.createdAt)}
                    </span>
                    {canDelete(c) && (
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        disabled={deletingId === c.id}
                        aria-label="Delete comment"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-red-400 disabled:opacity-40"
                      >
                        {deletingId === c.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-300 break-words leading-relaxed">
                    {c.comment}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Comment Form */}
      <form onSubmit={handleSubmit} className="flex gap-2 items-end">
        <div className="flex-1 glass-strong rounded-lg border border-white/10 focus-within:border-indigo-500/50 transition-colors">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (comment.trim()) handleSubmit(e);
              }
            }}
            placeholder="Add a comment… (⌘↵ to send)"
            disabled={isSubmitting}
            className="w-full bg-transparent text-white placeholder-gray-500 p-3 resize-none focus:outline-none text-xs"
            rows={2}
            maxLength={2000}
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting || !comment.trim()}
          className="shrink-0 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2.5 px-3 rounded-lg transition-colors text-xs"
        >
          {isSubmitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </form>
    </div>
  );
}

