"use client";

import { useState } from "react";
import useSWR from "swr";
import { Send, Loader2 } from "lucide-react";
import Image from "next/image";
import { formatDate } from "@/lib/dateFormat";
import { useToast } from "@/components/Providers/ToastProvider";
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
}

export function CommentsListForm({ requestId }: CommentsListFormProps) {
  const { data, isLoading, mutate } = useSWR<{ comments: Comment[] }>(
    `/api/requests/${requestId}/comments`
  );
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const comments = data?.comments ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">
          Comments ({comments.length})
        </h3>

        {/* Comments List */}
        <div className="space-y-3 mb-6 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mx-auto" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No comments yet. Be the first to comment!
            </div>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className="glass-strong rounded-lg p-4 border border-white/10 hover:border-white/20 transition-colors"
              >
                <div className="flex gap-3">
                  {c.user.avatarUrl ? (
                    <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0">
                      <Image
                        src={c.user.avatarUrl}
                        alt={c.user.username}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center shrink-0 text-xs font-bold">
                      {c.user.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white text-sm">
                        {c.user.username}
                      </span>
                      {c.isAdminComment && (
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-200 text-xs rounded font-semibold border border-amber-500/30">
                          Admin
                        </span>
                      )}
                      <span className="text-xs text-gray-400 ml-auto">
                        {formatDate(c.createdAt)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 break-words">
                      {c.comment}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Comment Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="glass-strong rounded-lg border border-white/10 focus-within:border-white/30 transition-colors">
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment..."
              disabled={isSubmitting}
              className="w-full bg-transparent text-white placeholder-gray-500 p-4 resize-none focus:outline-none text-sm"
              rows={3}
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting || !comment.trim()}
            className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Posting...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Post Comment
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
