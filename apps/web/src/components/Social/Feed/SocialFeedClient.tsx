"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ListChecks, Heart, MessageCircle, Bookmark, Users, Star,
  TrendingUp, Award, Plus, RefreshCw, ChevronDown
} from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { formatDistanceToNow } from "date-fns";
import { getAvatarSrc, shouldBypassNextImage } from "@/lib/avatar";

interface SocialEvent {
  id: number;
  userId: number;
  eventType: string;
  targetType: string | null;
  targetId: number | null;
  metadata: Record<string, unknown>;
  visibility: string;
  createdAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  jellyfinUserId: string | null;
}

type FeedType = "friends" | "public";

export function SocialFeedClient() {
  const toast = useToast();
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedType, setFeedType] = useState<FeedType>("friends");
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);

  const fetchFeed = useCallback(async (reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
        setEvents([]);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams({ type: feedType, limit: "20" });
      if (!reset && nextBefore) params.set("before", nextBefore);

      const res = await fetch(`/api/v1/social/feed?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load feed");

      const data = await res.json();

      if (reset) {
        setEvents(data.events || []);
      } else {
        setEvents((prev) => [...prev, ...(data.events || [])]);
      }
      setHasMore(data.hasMore);
      setNextBefore(data.nextBefore);
    } catch {
      toast.error("Failed to load feed");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [feedType, nextBefore]);

  useEffect(() => {
    fetchFeed(true);
  }, [feedType]);

  return (
    <div className="pb-12">
      {/* Feed Type Toggle */}
      <div className="flex items-center gap-2 mb-6">
        <div className="flex bg-white/[0.03] border border-white/5 rounded-xl p-0.5">
          <button
            onClick={() => setFeedType("friends")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              feedType === "friends"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" /> Friends
          </button>
          <button
            onClick={() => setFeedType("public")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              feedType === "public"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <TrendingUp className="w-4 h-4" /> Public
          </button>
        </div>
        <button
          onClick={() => fetchFeed(true)}
          className="ml-auto p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
          title="Refresh feed"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="flex gap-3 p-4 bg-white/[0.02] rounded-xl border border-white/5">
                <div className="w-10 h-10 rounded-full bg-white/10 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-white/10 rounded" />
                  <div className="h-3 w-32 bg-white/5 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : events.length === 0 ? (
        <EmptyFeed feedType={feedType} />
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <FeedEventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      {/* Load More */}
      {hasMore && !loading && (
        <div className="text-center mt-6">
          <button
            onClick={() => fetchFeed(false)}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-gray-300 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {loadingMore ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}
    </div>
  );
}

function FeedEventCard({ event }: { event: SocialEvent }) {
  const { icon, text, link, accent } = getEventDisplay(event);
  const avatarSrc = getAvatarSrc(event);
  const bypass = shouldBypassNextImage(avatarSrc);

  return (
    <div className="flex gap-3 p-4 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 rounded-xl transition-colors">
      {/* Avatar */}
      <Link href={`/u/${event.username}`} className="flex-shrink-0">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-700">
          {bypass ? (
            <img src={avatarSrc} alt={event.username} className="object-cover w-full h-full" />
          ) : (
            <Image src={avatarSrc} alt={event.username} width={40} height={40} className="object-cover w-full h-full" />
          )}
        </div>
      </Link>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <div className={`mt-0.5 p-1 rounded-md ${accent}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200">
              <Link href={`/u/${event.username}`} className="font-semibold text-white hover:text-indigo-300 transition-colors">
                {event.displayName || event.username}
              </Link>{" "}
              {text}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>

        {/* Preview card for list events */}
        {link && event.metadata?.listName ? (
          <Link
            href={link}
            className="mt-3 block p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-lg transition-colors"
          >
            <p className="text-sm font-medium text-white truncate">
              {String(event.metadata.listName)}
            </p>
            {event.metadata.listOwner ? (
              <p className="text-xs text-gray-500 mt-0.5">
                by @{String(event.metadata.listOwner)}
              </p>
            ) : null}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function getEventDisplay(event: SocialEvent): { icon: React.ReactNode; text: React.ReactNode; link: string | null; accent: string } {
  const listName = event.metadata?.listName as string | undefined;
  const listLink = event.targetId ? `/lists/${event.targetId}` : null;

  switch (event.eventType) {
    case "created_list":
      return {
        icon: <Plus className="w-3.5 h-3.5" />,
        text: <>created a new list{listName && <> &ldquo;<Link href={listLink || "#"} className="text-indigo-400 hover:text-indigo-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-emerald-500/10 text-emerald-400",
      };
    case "updated_list":
      return {
        icon: <ListChecks className="w-3.5 h-3.5" />,
        text: <>updated their list{listName && <> &ldquo;<Link href={listLink || "#"} className="text-indigo-400 hover:text-indigo-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-blue-500/10 text-blue-400",
      };
    case "added_item":
      return {
        icon: <Plus className="w-3.5 h-3.5" />,
        text: <>added an item to{listName && <> &ldquo;<Link href={listLink || "#"} className="text-indigo-400 hover:text-indigo-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-cyan-500/10 text-cyan-400",
      };
    case "hit_milestone":
      return {
        icon: <Award className="w-3.5 h-3.5" />,
        text: <>hit a milestone! {event.metadata?.milestone as string || ""}</>,
        link: null,
        accent: "bg-amber-500/10 text-amber-400",
      };
    case "liked_list":
      return {
        icon: <Heart className="w-3.5 h-3.5" />,
        text: <>liked{listName && <> &ldquo;<Link href={listLink || "#"} className="text-indigo-400 hover:text-indigo-300">{listName}</Link>&rdquo;</>}{event.metadata?.listOwner && <> by @{event.metadata.listOwner as string}</>}</>,
        link: listLink,
        accent: "bg-pink-500/10 text-pink-400",
      };
    case "commented_list":
      return {
        icon: <MessageCircle className="w-3.5 h-3.5" />,
        text: <>commented on{listName && <> &ldquo;<Link href={listLink || "#"} className="text-indigo-400 hover:text-indigo-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-blue-500/10 text-blue-400",
      };
    case "saved_list":
      return {
        icon: <Bookmark className="w-3.5 h-3.5" />,
        text: <>{event.metadata?.isRemix ? "remixed" : "saved"}{listName && <> &ldquo;<Link href={listLink || "#"} className="text-indigo-400 hover:text-indigo-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-amber-500/10 text-amber-400",
      };
    case "became_friends":
      return {
        icon: <Users className="w-3.5 h-3.5" />,
        text: <>became friends with <Link href={`/u/${event.metadata?.friendUsername as string}`} className="font-semibold text-white hover:text-indigo-300">{event.metadata?.friendUsername as string}</Link></>,
        link: null,
        accent: "bg-indigo-500/10 text-indigo-400",
      };
    default:
      return {
        icon: <Star className="w-3.5 h-3.5" />,
        text: <>did something cool</>,
        link: null,
        accent: "bg-gray-500/10 text-gray-400",
      };
  }
}

function EmptyFeed({ feedType }: { feedType: FeedType }) {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/5 mx-auto mb-4 flex items-center justify-center">
        {feedType === "friends" ? (
          <Users className="w-8 h-8 text-indigo-400" />
        ) : (
          <TrendingUp className="w-8 h-8 text-purple-400" />
        )}
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">
        {feedType === "friends" ? "No friend activity yet" : "No public activity yet"}
      </h3>
      <p className="text-sm text-gray-400 mb-6 max-w-sm mx-auto">
        {feedType === "friends"
          ? "Add friends to see their activity here. Create lists and share with friends to get started!"
          : "Be the first to create and share public lists!"
        }
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link
          href="/friends"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
        >
          <Users className="w-4 h-4" /> Find Friends
        </Link>
        <Link
          href="/lists"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 text-sm font-medium transition-colors"
        >
          <ListChecks className="w-4 h-4" /> My Lists
        </Link>
      </div>
    </div>
  );
}
