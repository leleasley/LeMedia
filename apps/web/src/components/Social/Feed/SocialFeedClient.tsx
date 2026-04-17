"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ListChecks, Heart, MessageCircle, Bookmark, Users, Star,
  TrendingUp, Award, Plus, RefreshCw, ChevronDown, Clapperboard, Quote
} from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { formatDistanceToNow } from "date-fns";
import { getAvatarSrc, shouldBypassNextImage } from "@/lib/avatar";
import { SOCIAL_FEED_REFRESH_EVENT } from "@/lib/social-feed-refresh";

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

type EventDisplay = {
  icon: React.ReactNode;
  text: React.ReactNode;
  link: string | null;
  accent: string;
  label: string;
};

export function SocialFeedClient() {
  const toast = useToast();
  const [events, setEvents] = useState<SocialEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedType, setFeedType] = useState<FeedType>("friends");
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const nextBeforeRef = useRef<string | null>(null);

  useEffect(() => {
    nextBeforeRef.current = nextBefore;
  }, [nextBefore]);

  const fetchFeed = useCallback(async (reset: boolean = false) => {
    try {
      if (reset) {
        setLoading(true);
        setEvents([]);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams({ type: feedType, limit: "20" });
      if (!reset && nextBeforeRef.current) params.set("before", nextBeforeRef.current);

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
  }, [feedType, toast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading social feed on mount and tab change; paginated fetch managed in callback
    fetchFeed(true);
  }, [fetchFeed]);

  useEffect(() => {
    const handleRefresh = () => {
      fetchFeed(true);
    };
    window.addEventListener(SOCIAL_FEED_REFRESH_EVENT, handleRefresh);
    return () => window.removeEventListener(SOCIAL_FEED_REFRESH_EVENT, handleRefresh);
  }, [fetchFeed]);

  return (
    <div className="pb-12">
      <div className="mb-6 rounded-2xl border border-white/8 bg-[radial-gradient(circle_at_top_left,rgba(236,72,153,0.14),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-pink-300/80">Social</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Activity feed</h2>
            <p className="mt-1 text-sm text-white/55">
              {feedType === "friends"
                ? "Follow the people you know and jump into the lists, reviews, and reactions they post."
                : "See what the wider LeMedia community is sharing right now."}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <div className="flex bg-black/20 border border-white/5 rounded-xl p-0.5">
          <button
            onClick={() => setFeedType("friends")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              feedType === "friends"
                ? "bg-pink-600 text-white shadow-md shadow-pink-500/20"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <Users className="w-4 h-4" /> Friends
          </button>
          <button
            onClick={() => setFeedType("public")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              feedType === "public"
                ? "bg-pink-600 text-white shadow-md shadow-pink-500/20"
                : "text-gray-400 hover:text-white"
            }`}
          >
            <TrendingUp className="w-4 h-4" /> Public
          </button>
            </div>
            <button
              onClick={() => fetchFeed(true)}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              title="Refresh feed"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
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
  const { icon, text, link, accent, label } = getEventDisplay(event);
  const avatarSrc = getAvatarSrc(event);
  const bypass = shouldBypassNextImage(avatarSrc);
  const reviewText = typeof event.metadata?.reviewText === "string" ? event.metadata.reviewText.trim() : "";
  const reviewRating = Number(event.metadata?.rating ?? 0);
  const isReviewEvent = event.eventType === "reviewed_media";
  const reviewHref = link;
  const listName = typeof event.metadata?.listName === "string" ? event.metadata.listName : "";
  const listOwner = typeof event.metadata?.listOwner === "string" ? event.metadata.listOwner : "";

  return (
    <div className="group rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 transition-colors hover:border-white/12 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.03))]">
      <div className="flex gap-3">
        <Link href={`/u/${event.username}`} className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-pink-600 to-rose-700 ring-1 ring-white/10">
            {bypass ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarSrc} alt={event.username} className="object-cover w-full h-full" />
            ) : (
              <Image src={avatarSrc} alt={event.username} width={40} height={40} className="object-cover w-full h-full" />
            )}
          </div>
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <div className={`mt-0.5 rounded-lg p-1.5 ${accent}`}>
              {icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-white/40">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 font-semibold uppercase tracking-[0.18em] text-white/45">
                  {label}
                </span>
                <span>{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</span>
              </div>
              <p className="text-sm text-gray-200">
                <Link href={`/u/${event.username}`} className="font-semibold text-white hover:text-pink-300 transition-colors">
                  {event.displayName || event.username}
                </Link>{" "}
                {text}
              </p>
            </div>
          </div>

          {link && listName ? (
            <Link
              href={link}
              className="mt-3 block rounded-xl border border-white/8 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.06]"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">{listName}</p>
                  {listOwner ? <p className="mt-0.5 text-xs text-gray-500">by @{listOwner}</p> : null}
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-semibold text-white/60 transition-colors group-hover:text-white/80">
                  Open
                </span>
              </div>
            </Link>
          ) : null}

          {link && !listName && !isReviewEvent ? (
            <Link
              href={link}
              className="mt-3 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/[0.07] hover:text-white"
            >
              Open activity target
            </Link>
          ) : null}

          {isReviewEvent && (reviewRating > 0 || reviewText) ? (
            <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-500/[0.06] p-3">
              {reviewRating > 0 ? (
                <div className="mb-2 flex items-center gap-1.5 text-amber-300">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`h-3.5 w-3.5 ${idx < reviewRating ? "fill-amber-400 text-amber-400" : "text-white/20"}`}
                    />
                  ))}
                  <span className="ml-1 text-xs font-semibold text-white/70">{reviewRating}/5</span>
                </div>
              ) : null}
              {reviewText ? (
                <div className="flex gap-2 text-sm leading-5 text-white/72">
                  <Quote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-300/70" />
                  <p className="line-clamp-3">{reviewText}</p>
                </div>
              ) : null}
              {reviewHref ? (
                <Link href={reviewHref} className="mt-3 inline-flex rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-400/15 hover:text-amber-200">
                  Open title
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getEventDisplay(event: SocialEvent): EventDisplay {
  const listName = event.metadata?.listName as string | undefined;
  const listLink = event.targetId ? `/lists/${event.targetId}` : null;

  switch (event.eventType) {
    case "created_list":
      return {
        icon: <Plus className="w-3.5 h-3.5" />,
        text: <>created a new list{listName && <> &ldquo;<Link href={listLink || "#"} className="text-pink-400 hover:text-pink-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-emerald-500/10 text-emerald-400",
        label: "New list",
      };
    case "updated_list":
      return {
        icon: <ListChecks className="w-3.5 h-3.5" />,
        text: <>updated their list{listName && <> &ldquo;<Link href={listLink || "#"} className="text-pink-400 hover:text-pink-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-pink-500/10 text-pink-400",
        label: "List edit",
      };
    case "added_item":
      return {
        icon: <Plus className="w-3.5 h-3.5" />,
        text: <>added an item to{listName && <> &ldquo;<Link href={listLink || "#"} className="text-pink-400 hover:text-pink-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-rose-500/10 text-rose-400",
        label: "List add",
      };
    case "hit_milestone":
      return {
        icon: <Award className="w-3.5 h-3.5" />,
        text: <>hit a milestone! {event.metadata?.milestone as string || ""}</>,
        link: null,
        accent: "bg-amber-500/10 text-amber-400",
        label: "Milestone",
      };
    case "liked_list":
      return {
        icon: <Heart className="w-3.5 h-3.5" />,
        text: <>liked{listName && <> &ldquo;<Link href={listLink || "#"} className="text-pink-400 hover:text-pink-300">{listName}</Link>&rdquo;</>}{event.metadata?.listOwner && <> by @{event.metadata.listOwner as string}</>}</>,
        link: listLink,
        accent: "bg-pink-500/10 text-pink-400",
        label: "Like",
      };
    case "commented_list":
      return {
        icon: <MessageCircle className="w-3.5 h-3.5" />,
        text: <>commented on{listName && <> &ldquo;<Link href={listLink || "#"} className="text-pink-400 hover:text-pink-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-pink-500/10 text-pink-400",
        label: "Comment",
      };
    case "saved_list":
      return {
        icon: <Bookmark className="w-3.5 h-3.5" />,
        text: <>{event.metadata?.isRemix ? "remixed" : "saved"}{listName && <> &ldquo;<Link href={listLink || "#"} className="text-pink-400 hover:text-pink-300">{listName}</Link>&rdquo;</>}</>,
        link: listLink,
        accent: "bg-amber-500/10 text-amber-400",
        label: event.metadata?.isRemix ? "Remix" : "Save",
      };
    case "became_friends":
      return {
        icon: <Users className="w-3.5 h-3.5" />,
        text: <>became friends with <Link href={`/u/${event.metadata?.friendUsername as string}`} className="font-semibold text-white hover:text-pink-300">{event.metadata?.friendUsername as string}</Link></>,
        link: null,
        accent: "bg-pink-500/10 text-pink-400",
        label: "Friends",
      };
    case "reacted_media": {
      const mediaType = String(event.metadata?.mediaType ?? "movie") === "tv" ? "tv" : "movie";
      const tmdbId = Number(event.metadata?.tmdbId ?? event.targetId ?? 0);
      const mediaTitle = String(event.metadata?.mediaTitle ?? "a title");
      const emoji = String(event.metadata?.emoji ?? "🔥");
      const worthWatching = Boolean(event.metadata?.worthWatching ?? true);
      const mediaHref = tmdbId > 0 ? `/${mediaType}/${tmdbId}` : null;
      return {
        icon: <Clapperboard className="w-3.5 h-3.5" />,
        text: <>reacted {emoji} to {mediaHref ? <Link href={mediaHref} className="text-pink-400 hover:text-pink-300">{mediaTitle}</Link> : mediaTitle} {worthWatching ? "(worth watching)" : "(skip for now)"}</>,
        link: mediaHref,
        accent: "bg-indigo-500/10 text-indigo-300",
        label: "Reaction",
      };
    }
    case "reviewed_media": {
      const mediaType = String(event.metadata?.mediaType ?? "movie") === "tv" ? "tv" : "movie";
      const tmdbId = Number(event.metadata?.tmdbId ?? event.targetId ?? 0);
      const mediaTitle = String(event.metadata?.title ?? "a title");
      const rating = Number(event.metadata?.rating ?? 0);
      const mediaHref = tmdbId > 0 ? `/${mediaType}/${tmdbId}` : null;
      return {
        icon: <Star className="w-3.5 h-3.5" />,
        text: <>reviewed {mediaHref ? <Link href={mediaHref} className="text-pink-400 hover:text-pink-300">{mediaTitle}</Link> : mediaTitle}{rating > 0 ? <> and rated it <span className="font-medium text-white">{rating}/5</span></> : null}</>,
        link: mediaHref,
        accent: "bg-amber-500/10 text-amber-400",
        label: "Review",
      };
    }
    default:
      return {
        icon: <Star className="w-3.5 h-3.5" />,
        text: <>did something cool</>,
        link: null,
        accent: "bg-gray-500/10 text-gray-400",
        label: "Activity",
      };
  }
}

function EmptyFeed({ feedType }: { feedType: FeedType }) {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-pink-500/10 to-rose-500/10 border border-white/5 mx-auto mb-4 flex items-center justify-center">
        {feedType === "friends" ? (
          <Users className="w-8 h-8 text-pink-400" />
        ) : (
          <TrendingUp className="w-8 h-8 text-rose-400" />
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
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white text-sm font-medium transition-colors"
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
