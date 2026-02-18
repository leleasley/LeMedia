"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Heart, MessageCircle, Bookmark, Send, Share2,
  MoreHorizontal, Trash2, Edit2, Flag, ChevronDown,
  ThumbsUp, Flame, Brain, HandMetal, Copy
} from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { formatDistanceToNow } from "date-fns";
import { getAvatarSrc, shouldBypassNextImage, getAvatarAlt } from "@/lib/avatar";

interface ReactionSummary {
  reaction: string;
  count: number;
  userReacted: boolean;
}

interface Comment {
  id: number;
  listId: number;
  userId: number;
  parentId: number | null;
  content: string;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  jellyfinUserId: string | null;
  replyCount: number;
}

const REACTION_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  like: { icon: <Heart className="w-4 h-4" />, label: "Like", color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  love: { icon: <Heart className="w-4 h-4 fill-current" />, label: "Love", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  fire: { icon: <Flame className="w-4 h-4" />, label: "Fire", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  mindblown: { icon: <Brain className="w-4 h-4" />, label: "Mind Blown", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  clap: { icon: <HandMetal className="w-4 h-4" />, label: "Clap", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
};

export function ListSocialBar({
  listId,
  allowComments,
  allowReactions,
  allowRemix,
  isOwner,
}: {
  listId: number;
  allowComments: boolean;
  allowReactions: boolean;
  allowRemix: boolean;
  isOwner: boolean;
}) {
  const toast = useToast();
  const [reactions, setReactions] = useState<ReactionSummary[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    fetchReactions();
    checkSaved();
  }, [listId]);

  const fetchReactions = async () => {
    try {
      const res = await fetch(`/api/v1/lists/${listId}/reactions`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setReactions(data.reactions || []);
      }
    } catch { /* ignore */ }
  };

  const fetchComments = async () => {
    try {
      setCommentsLoading(true);
      const res = await fetch(`/api/v1/lists/${listId}/comments`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setComments(data.comments || []);
      }
    } catch {
      toast.error("Failed to load comments");
    } finally {
      setCommentsLoading(false);
    }
  };

  const checkSaved = async () => {
    try {
      const res = await fetch(`/api/v1/lists/${listId}/save`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSaved(data.saved);
      }
    } catch { /* ignore */ }
  };

  const handleReaction = async (reaction: string) => {
    try {
      const existing = reactions.find((r) => r.reaction === reaction);
      if (existing?.userReacted) {
        await csrfFetch(`/api/v1/lists/${listId}/reactions?reaction=${reaction}`, { method: "DELETE" });
      } else {
        await csrfFetch(`/api/v1/lists/${listId}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reaction }),
        });
      }
      fetchReactions();
      setShowReactionPicker(false);
    } catch {
      toast.error("Failed to react");
    }
  };

  const handleSave = async () => {
    try {
      if (saved) {
        await csrfFetch(`/api/v1/lists/${listId}/save`, { method: "DELETE" });
        setSaved(false);
        toast.success("List unsaved");
      } else {
        await csrfFetch(`/api/v1/lists/${listId}/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        setSaved(true);
        toast.success("List saved!");
      }
    } catch {
      toast.error("Failed to save list");
    }
  };

  const handleRemix = async () => {
    try {
      const res = await csrfFetch(`/api/v1/lists/${listId}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remix: true }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      const data = await res.json();
      toast.success("List remixed! Redirecting...");
      setTimeout(() => {
        window.location.href = `/lists/${data.newListId}`;
      }, 1000);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remix list");
    }
  };

  const handleCommentSubmit = async () => {
    if (!newComment.trim()) return;
    try {
      setSubmitting(true);
      const res = await csrfFetch(`/api/v1/lists/${listId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newComment.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed");
      }
      const data = await res.json();
      setComments((prev) => [...prev, data.comment]);
      setNewComment("");
      toast.success("Comment posted!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    try {
      const res = await csrfFetch(`/api/v1/lists/${listId}/comments/${commentId}`, { method: "DELETE" });
      if (res.ok) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
        toast.success("Comment deleted");
      }
    } catch {
      toast.error("Failed to delete comment");
    }
  };

  const likeReaction = reactions.find((r) => r.reaction === "like");
  const totalReactions = reactions.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="border-t border-white/5 mt-6 pt-4">
      {/* Reactions Summary */}
      {totalReactions > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {reactions.map((r) => {
            const config = REACTION_CONFIG[r.reaction];
            if (!config || r.count === 0) return null;
            return (
              <button
                key={r.reaction}
                onClick={() => handleReaction(r.reaction)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-all ${
                  r.userReacted
                    ? config.color
                    : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                }`}
              >
                {config.icon}
                <span>{r.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-1 flex-wrap">
        {/* Like Button */}
        {allowReactions && (
          <div className="relative">
            <button
              onClick={() => handleReaction("like")}
              onContextMenu={(e) => { e.preventDefault(); setShowReactionPicker(!showReactionPicker); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                likeReaction?.userReacted
                  ? "bg-pink-500/10 text-pink-400 border border-pink-500/20"
                  : "bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5"
              }`}
            >
              <Heart className={`w-4 h-4 ${likeReaction?.userReacted ? "fill-current" : ""}`} />
              {likeReaction && likeReaction.count > 0 ? likeReaction.count : "Like"}
            </button>

            {/* Reaction Picker */}
            {showReactionPicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowReactionPicker(false)} />
                <div className="absolute bottom-full left-0 mb-2 z-50 flex gap-1 p-2 bg-gray-900 border border-white/10 rounded-xl shadow-2xl">
                  {Object.entries(REACTION_CONFIG).map(([key, config]) => {
                    const existing = reactions.find((r) => r.reaction === key);
                    return (
                      <button
                        key={key}
                        onClick={() => handleReaction(key)}
                        className={`p-2 rounded-lg transition-all hover:scale-110 ${
                          existing?.userReacted ? config.color : "hover:bg-white/10 text-gray-400"
                        }`}
                        title={config.label}
                      >
                        {config.icon}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Comment Button */}
        {allowComments && (
          <button
            onClick={() => {
              if (!showComments) fetchComments();
              setShowComments(!showComments);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 text-sm transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            {comments.length > 0 ? comments.length : "Comment"}
          </button>
        )}

        {/* Save Button */}
        {!isOwner && (
          <button
            onClick={handleSave}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
              saved
                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                : "bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5"
            }`}
          >
            <Bookmark className={`w-4 h-4 ${saved ? "fill-current" : ""}`} />
            {saved ? "Saved" : "Save"}
          </button>
        )}

        {/* Remix Button */}
        {!isOwner && allowRemix && (
          <button
            onClick={handleRemix}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 text-sm transition-all"
          >
            <Copy className="w-4 h-4" />
            Remix
          </button>
        )}
      </div>

      {/* Comments Section */}
      {showComments && allowComments && (
        <div className="mt-4 space-y-3">
          {commentsLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="animate-pulse flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0" />
                  <div className="flex-1 h-12 bg-white/5 rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <>
              {comments.map((comment) => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  onDelete={() => handleDeleteComment(comment.id)}
                  isOwner={isOwner}
                />
              ))}

              {comments.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">No comments yet. Be the first!</p>
              )}

              {/* New Comment */}
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(); } }}
                  placeholder="Write a comment..."
                  maxLength={2000}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                  onClick={handleCommentSubmit}
                  disabled={!newComment.trim() || submitting}
                  className="px-3 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function CommentCard({
  comment,
  onDelete,
  isOwner,
}: {
  comment: Comment;
  onDelete: () => void;
  isOwner: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const avatarSrc = getAvatarSrc(comment);
  const bypass = shouldBypassNextImage(avatarSrc);

  return (
    <div className="flex gap-2 group">
      <Link href={`/u/${comment.username}`} className="flex-shrink-0">
        <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700">
          {bypass ? (
            <img src={avatarSrc} alt={getAvatarAlt(comment)} className="object-cover w-full h-full" />
          ) : (
            <Image src={avatarSrc} alt={getAvatarAlt(comment)} width={32} height={32} className="object-cover w-full h-full" />
          )}
        </div>
      </Link>
      <div className="flex-1 min-w-0">
        <div className="bg-white/[0.03] rounded-xl px-3 py-2 border border-white/5">
          <div className="flex items-center gap-2 mb-0.5">
            <Link href={`/u/${comment.username}`} className="text-xs font-semibold text-white hover:text-indigo-300 transition-colors">
              {comment.displayName || comment.username}
            </Link>
            <span className="text-[10px] text-gray-500">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
            {comment.edited && <span className="text-[10px] text-gray-600">(edited)</span>}
          </div>
          <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{comment.content}</p>
        </div>

        {/* Comment actions (visible on hover) */}
        <div className="relative inline-block">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="mt-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-white/5 text-gray-500 transition-all"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
              <div className="absolute left-0 top-full z-50 w-36 bg-gray-900 border border-white/10 rounded-lg shadow-2xl overflow-hidden">
                {(isOwner || true) && (
                  <button
                    onClick={() => { onDelete(); setShowMenu(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
