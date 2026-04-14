"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ArrowUpRight, MessageSquare, Star } from "lucide-react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/dateFormat";
import { tmdbImageUrl } from "@/lib/tmdb-images";
import { triggerSocialFeedRefresh } from "@/lib/social-feed-refresh";

const fetcher = (url: string) => fetch(url).then((response) => response.json());

type PendingReviewItem = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  watchedAt: string;
};

type PendingReviewsResponse = {
  count: number;
  items: PendingReviewItem[];
};

type DraftState = {
  rating: number;
  reviewText: string;
  spoiler: boolean;
};

function createEmptyDraft(): DraftState {
  return {
    rating: 0,
    reviewText: "",
    spoiler: false,
  };
}

export function ReviewQueuePageClient({ imageProxyEnabled }: { imageProxyEnabled: boolean }) {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<PendingReviewsResponse>(
    "/api/v1/my-activity/pending-reviews?limit=24",
    fetcher
  );

  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [submittingKey, setSubmittingKey] = useState<string | null>(null);

  const items = data?.items ?? [];
  const total = data?.count ?? 0;
  const firstItem = items[0] ?? null;

  const firstItemHref = useMemo(() => {
    if (!firstItem) return null;
    return `/${firstItem.mediaType}/${firstItem.tmdbId}#reviews`;
  }, [firstItem]);

  function getItemKey(item: PendingReviewItem) {
    return `${item.mediaType}:${item.tmdbId}`;
  }

  function getDraft(item: PendingReviewItem) {
    return drafts[getItemKey(item)] ?? createEmptyDraft();
  }

  function updateDraft(item: PendingReviewItem, nextDraft: Partial<DraftState>) {
    const key = getItemKey(item);
    setDrafts((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? createEmptyDraft()),
        ...nextDraft,
      },
    }));
  }

  async function submitReview(item: PendingReviewItem) {
    const key = getItemKey(item);
    const draft = drafts[key] ?? createEmptyDraft();
    if (draft.rating <= 0) {
      toast.error("Pick a star rating before posting.");
      return;
    }

    setSubmittingKey(key);
    try {
      const response = await csrfFetch("/api/v1/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          rating: draft.rating,
          reviewText: draft.reviewText.trim() || null,
          spoiler: draft.spoiler,
          title: item.title,
          posterPath: item.posterPath ?? null,
          releaseYear: item.releaseYear ?? null,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        toast.error(error?.error || "Failed to save review");
        return;
      }

      await mutate((current) => {
        if (!current) return current;
        return {
          count: Math.max(0, current.count - 1),
          items: current.items.filter((queuedItem) => getItemKey(queuedItem) !== key),
        };
      }, { revalidate: false });

      setDrafts((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });

      window.dispatchEvent(new CustomEvent("media-review-state-changed", {
        detail: { mediaType: item.mediaType, tmdbId: item.tmdbId, hasReview: true },
      }));
      triggerSocialFeedRefresh();

      toast.success("Review posted. It will appear on the title page as well.");
    } catch {
      toast.error("Failed to save review");
    } finally {
      setSubmittingKey(null);
      void mutate();
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-100">
            <MessageSquare className="h-3.5 w-3.5" />
            Review queue
          </div>
          <h1 className="mt-3 text-3xl font-bold text-white">Unwritten Reviews</h1>
          <p className="mt-2 max-w-2xl text-sm text-gray-400">
            Titles you marked watched but have not reviewed yet. This page is only here as a queue shortcut for the app.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {firstItemHref ? (
            <PrefetchLink
              href={firstItemHref}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
            >
              Open next title page
              <ArrowUpRight className="h-4 w-4" />
            </PrefetchLink>
          ) : null}
          <PrefetchLink
            href="/reviews"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Community reviews
            <ArrowUpRight className="h-4 w-4" />
          </PrefetchLink>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Queue size</div>
            <div className="mt-1 text-2xl font-semibold text-white">{total}</div>
          </div>
          <div className="text-right text-sm text-gray-400">
            {total === 0 ? "Everything is reviewed." : "You can write reviews here directly and they will show up on each title page too."}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex items-center justify-center text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center">
          <h2 className="text-lg font-semibold text-white">Queue cleared</h2>
          <p className="mt-2 text-sm text-gray-400">You do not have any watched titles waiting for a review.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {items.map((item) => {
            const href = `/${item.mediaType}/${item.tmdbId}#reviews`;
            const posterUrl = tmdbImageUrl(item.posterPath ?? null, "w300", imageProxyEnabled);
            const itemKey = getItemKey(item);
            const draft = getDraft(item);
            const isSubmitting = submittingKey === itemKey;

            return (
              <div
                key={itemKey}
                className="group relative flex flex-col rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-5 transition-all hover:border-white/20 hover:bg-white/[0.02] overflow-hidden"
              >
                <div className="relative z-10 flex gap-5">
                  <Link
                    href={href}
                    aria-label={`Open ${item.title} page`}
                    className="group/poster block shrink-0"
                  >
                    <div className="relative h-32 w-24 overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-2xl transition-transform duration-300 group-hover/poster:scale-[1.03]">
                      {posterUrl ? (
                        <Image src={posterUrl} alt={item.title} fill className="object-cover transition-transform duration-500 group-hover/poster:scale-110" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-gray-700">
                          <Star className="h-6 w-6 opacity-30" />
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="flex flex-1 flex-col justify-start min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70">
                        {item.mediaType === "movie" ? "Movie" : "Series"}
                      </span>
                      <span className="text-xs text-amber-200/70">{item.releaseYear}</span>
                    </div>

                    <Link href={href} className="group/link mt-2 inline-block">
                      <h2 className="line-clamp-2 text-xl font-bold text-white transition-colors group-hover/link:text-amber-300">
                        {item.title}
                      </h2>
                    </Link>

                    <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-400">
                      <MessageSquare className="h-3.5 w-3.5 opacity-60" />
                      Watched on {formatDate(item.watchedAt)}
                    </p>

                    <div className="mt-auto pt-2">
                      <PrefetchLink
                        href={href}
                        className="inline-flex items-center justify-center rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/10"
                      >
                        Target page
                        <ArrowUpRight className="ml-1 h-3.5 w-3.5 opacity-70" />
                      </PrefetchLink>
                    </div>
                  </div>
                </div>

                <div className="mt-4 border-t border-white/10 pt-4">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, index) => {
                      const value = index + 1;
                      return (
                        <button
                          key={value}
                          type="button"
                          className="p-1"
                          onClick={() => updateDraft(item, { rating: value })}
                          disabled={isSubmitting}
                          aria-label={`Rate ${value} stars`}
                        >
                          <Star
                            className={cn(
                              "h-5 w-5",
                              value <= draft.rating ? "fill-amber-400 text-amber-400" : "text-gray-500"
                            )}
                          />
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 rounded-xl border border-white/10 bg-black/10 focus-within:border-white/20 transition-colors">
                    <textarea
                      value={draft.reviewText}
                      onChange={(event) => updateDraft(item, { reviewText: event.target.value })}
                      placeholder="Write a short review"
                      disabled={isSubmitting}
                      className="min-h-28 w-full resize-none bg-transparent p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
                    />
                  </div>

                  <label className="mt-3 flex items-center gap-2 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={draft.spoiler}
                      onChange={(event) => updateDraft(item, { spoiler: event.target.checked })}
                      disabled={isSubmitting}
                      className="accent-amber-400"
                    />
                    Contains spoilers
                  </label>

                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div></div>

                    <button
                      type="button"
                      onClick={() => void submitReview(item)}
                      disabled={isSubmitting || draft.rating <= 0}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Post review
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}