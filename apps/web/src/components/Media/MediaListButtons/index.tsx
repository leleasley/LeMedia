"use client";

import { useEffect, useMemo, useState } from "react";
import { HeartIcon, StarIcon, ListBulletIcon, BellIcon, EyeIcon } from "@heroicons/react/24/outline";
import { HeartIcon as HeartIconSolid, StarIcon as StarIconSolid, BellIcon as BellIconSolid, EyeIcon as EyeIconSolid } from "@heroicons/react/24/solid";
import { Loader2, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { triggerSocialFeedRefresh } from "@/lib/social-feed-refresh";
import Button from "@/components/Common/Button";
import { AddToListModal } from "@/components/Lists";
import { Modal } from "@/components/Common/Modal";

type MediaType = "movie" | "tv";

type TvSeasonOption = {
  seasonNumber: number;
  name: string;
};

export function MediaListButtons({
  tmdbId,
  mediaType,
  className,
  initialFavorite,
  initialWatchlist,
  initialWatched,
  initialHasReview,
  reviewPromptEligible,
  title,
  tvSeasonOptions,
  onWatchedSeasonsChange,
}: {
  tmdbId: number;
  mediaType: MediaType;
  className?: string;
  initialFavorite?: boolean | null;
  initialWatchlist?: boolean | null;
  initialWatched?: boolean | null;
  initialHasReview?: boolean | null;
  reviewPromptEligible?: boolean | null;
  title?: string;
  tvSeasonOptions?: TvSeasonOption[];
  onWatchedSeasonsChange?: (seasonNumbers: number[]) => void;
}) {
  const [favorite, setFavorite] = useState(Boolean(initialFavorite));
  const [watchlist, setWatchlist] = useState(Boolean(initialWatchlist));
  const [watched, setWatched] = useState(Boolean(initialWatched));
  const [hasReview, setHasReview] = useState(Boolean(initialHasReview));
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(initialFavorite == null || initialWatchlist == null || initialWatched == null);
  const [saving, setSaving] = useState(false);
  const [listModalOpen, setListModalOpen] = useState(false);
  const [reviewPromptOpen, setReviewPromptOpen] = useState(false);
  const [reviewComposerOpen, setReviewComposerOpen] = useState(false);
  const [seasonModalOpen, setSeasonModalOpen] = useState(false);
  const [seasonDataLoaded, setSeasonDataLoaded] = useState(false);
  const [selectedWatchedSeasons, setSelectedWatchedSeasons] = useState<number[]>([]);
  const [savedWatchedSeasons, setSavedWatchedSeasons] = useState<number[]>([]);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSpoiler, setReviewSpoiler] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const toast = useToast();

  const availableTvSeasonOptions = useMemo(
    () => (tvSeasonOptions ?? [])
      .filter((season) => Number.isInteger(season.seasonNumber) && season.seasonNumber > 0)
      .sort((left, right) => left.seasonNumber - right.seasonNumber),
    [tvSeasonOptions]
  );
  const isMultiSeasonTv = mediaType === "tv" && availableTvSeasonOptions.length > 1;
  const isSingleSeasonTv = mediaType === "tv" && availableTvSeasonOptions.length === 1;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing review presence from parent prop; not a data fetch
    setHasReview(Boolean(initialHasReview));
  }, [initialHasReview]);

  useEffect(() => {
    if (hasReview) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- closing composer UI when review exists; pure UI state, not a data fetch
      setReviewComposerOpen(false);
      setReviewPromptOpen(false);
    }
  }, [hasReview]);

  useEffect(() => {
    const handleReviewStateChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ mediaType: MediaType; tmdbId: number; hasReview: boolean }>).detail;
      if (!detail) return;
      if (detail.mediaType !== mediaType || detail.tmdbId !== tmdbId) return;
      setHasReview(Boolean(detail.hasReview));
    };

    window.addEventListener("media-review-state-changed", handleReviewStateChanged as EventListener);
    return () => {
      window.removeEventListener("media-review-state-changed", handleReviewStateChanged as EventListener);
    };
  }, [mediaType, tmdbId]);

  useEffect(() => {
    if (initialFavorite != null && initialWatchlist != null && initialWatched != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing loading flag when initial data provided via props; not a data fetch
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetch(`/api/v1/media-list?tmdbId=${tmdbId}&mediaType=${mediaType}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setFavorite(Boolean(data.favorite));
        setWatchlist(Boolean(data.watchlist));
        setWatched(Boolean(data.watched));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    fetch(`/api/following/status?tmdbId=${tmdbId}&mediaType=${mediaType}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setFollowed(Boolean(data.followed));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [tmdbId, mediaType, initialFavorite, initialWatchlist, initialWatched]);

  useEffect(() => {
    if (!isMultiSeasonTv) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting season data state when media type changes; not a data fetch
      setSeasonDataLoaded(false);
      setSelectedWatchedSeasons([]);
      setSavedWatchedSeasons([]);
      return;
    }

    let active = true;
    setSeasonDataLoaded(false);
    fetch(`/api/v1/media-list/tv-seasons?tmdbId=${tmdbId}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const savedSeasonNumbers = Array.isArray(data.seasonNumbers)
          ? data.seasonNumbers
            .map((seasonNumber: unknown) => Number(seasonNumber))
            .filter((seasonNumber: number) => Number.isInteger(seasonNumber) && seasonNumber > 0)
          : [];

        if (savedSeasonNumbers.length > 0) {
          setSelectedWatchedSeasons(savedSeasonNumbers);
          setSavedWatchedSeasons(savedSeasonNumbers);
          onWatchedSeasonsChange?.(savedSeasonNumbers);
        } else if (watched) {
          const allSeasonNumbers = availableTvSeasonOptions.map((season) => season.seasonNumber);
          setSelectedWatchedSeasons(allSeasonNumbers);
          setSavedWatchedSeasons(allSeasonNumbers);
          onWatchedSeasonsChange?.(allSeasonNumbers);
        } else {
          setSelectedWatchedSeasons([]);
          setSavedWatchedSeasons([]);
          onWatchedSeasonsChange?.([]);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setSeasonDataLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [isMultiSeasonTv, tmdbId, watched, availableTvSeasonOptions, onWatchedSeasonsChange]);

  const toggleFollow = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = followed
        ? await csrfFetch("/api/following", {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaType, tmdbId })
        })
        : await csrfFetch("/api/following", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mediaType, tmdbId })
        });
      if (!res.ok) throw new Error("Request failed");
      setFollowed(!followed);
      toast.success(!followed ? "Now following this title" : "Stopped following this title", { timeoutMs: 3000 });
    } catch {
      toast.error("Failed to update follow status", { timeoutMs: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const syncTitleWatchedState = async (nextWatched: boolean) => {
    const res = await csrfFetch("/api/v1/media-list", {
      method: nextWatched ? "POST" : "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listType: "watched", mediaType, tmdbId })
    });
    if (!res.ok) throw new Error("Request failed");
    setWatched(nextWatched);
  };

  const toggle = async (listType: "favorite" | "watchlist" | "watched") => {
    if (saving) return;

    if (listType === "watched" && isMultiSeasonTv) {
      setSeasonModalOpen(true);
      return;
    }

    setSaving(true);
    const isActive = listType === "favorite" ? favorite : (listType === "watchlist" ? watchlist : watched);
    const method = isActive ? "DELETE" : "POST";
    try {
      const res = await csrfFetch("/api/v1/media-list", {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listType, mediaType, tmdbId })
      });
      if (!res.ok) throw new Error("Request failed");
      if (listType === "favorite") {
        setFavorite(!isActive);
        toast.success(
          !isActive ? "Added to your favorites" : "Removed from your favorites",
          { timeoutMs: 3000 }
        );
      }
      if (listType === "watchlist") {
        setWatchlist(!isActive);
        toast.success(
          !isActive ? "Added to your watchlist" : "Removed from your watchlist",
          { timeoutMs: 3000 }
        );
      }
      if (listType === "watched") {
        const nextWatched = !isActive;
        setWatched(nextWatched);
        if (isSingleSeasonTv && nextWatched) {
          const allSeasonNumbers = availableTvSeasonOptions.map((season) => season.seasonNumber);
          setSelectedWatchedSeasons(allSeasonNumbers);
          setSavedWatchedSeasons(allSeasonNumbers);
          onWatchedSeasonsChange?.(allSeasonNumbers);
        }
        if (isSingleSeasonTv && !nextWatched) {
          setSelectedWatchedSeasons([]);
          setSavedWatchedSeasons([]);
          onWatchedSeasonsChange?.([]);
        }
        toast.success(
          nextWatched ? "Marked as watched" : "Marked as unwatched",
          { timeoutMs: 3000 }
        );
        if (nextWatched && !hasReview) {
          if (mediaType === "movie" || isSingleSeasonTv || reviewPromptEligible) {
            setReviewPromptOpen(true);
          } else if (mediaType === "tv") {
            toast.info("Review prompts for series appear after you finish a season.", { timeoutMs: 3500 });
          }
        }
      }
    } catch {
      toast.error("Failed to update list", { timeoutMs: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const toggleSeasonSelection = (seasonNumber: number) => {
    setSelectedWatchedSeasons((current) => {
      if (current.includes(seasonNumber)) {
        return current.filter((value) => value !== seasonNumber);
      }
      return [...current, seasonNumber].sort((left, right) => left - right);
    });
  };

  const saveWatchedSeasons = async () => {
    if (!isMultiSeasonTv || saving) return;
    setSaving(true);
    try {
      const sortedSeasonNumbers = Array.from(new Set(selectedWatchedSeasons)).sort((left, right) => left - right);
      const newlyAddedSeason = sortedSeasonNumbers.some((seasonNumber) => !savedWatchedSeasons.includes(seasonNumber));
      const seasonRes = await csrfFetch("/api/v1/media-list/tv-seasons", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, seasonNumbers: sortedSeasonNumbers })
      });
      if (!seasonRes.ok) throw new Error("Request failed");

      const allSeasonNumbers = availableTvSeasonOptions.map((season) => season.seasonNumber);
      const isFullyWatched = allSeasonNumbers.length > 0 && allSeasonNumbers.every((seasonNumber) => sortedSeasonNumbers.includes(seasonNumber));

      if (isFullyWatched !== watched) {
        await syncTitleWatchedState(isFullyWatched);
      }

      setWatched(isFullyWatched);
      setSavedWatchedSeasons(sortedSeasonNumbers);
      onWatchedSeasonsChange?.(sortedSeasonNumbers);
      setSeasonModalOpen(false);

      if (sortedSeasonNumbers.length === 0) {
        toast.success("Cleared watched seasons", { timeoutMs: 3000 });
      } else if (isFullyWatched) {
        toast.success("Marked all seasons as watched", { timeoutMs: 3000 });
      } else {
        toast.success("Updated watched seasons", { timeoutMs: 3000 });
      }

      if (newlyAddedSeason && !hasReview) {
        setReviewPromptOpen(true);
      }
    } catch {
      toast.error("Failed to update watched seasons", { timeoutMs: 3000 });
    } finally {
      setSaving(false);
    }
  };

  const submitReview = async () => {
    if (reviewSubmitting) return;
    if (reviewRating <= 0) {
      toast.error("Pick a star rating before posting.");
      return;
    }

    setReviewSubmitting(true);
    try {
      const response = await csrfFetch("/api/v1/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaType,
          tmdbId,
          rating: reviewRating,
          reviewText: reviewText.trim() || null,
          spoiler: reviewSpoiler,
          title: title ?? "Unknown",
          posterPath: null,
          releaseYear: null,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        toast.error(error?.error || "Failed to save review");
        return;
      }

      setHasReview(true);
      setReviewComposerOpen(false);
      setReviewPromptOpen(false);
      setReviewRating(0);
      setReviewText("");
      setReviewSpoiler(false);
      window.dispatchEvent(new CustomEvent("media-review-state-changed", {
        detail: { mediaType, tmdbId, hasReview: true },
      }));
      triggerSocialFeedRefresh();
      toast.success("Review posted.");
    } catch {
      toast.error("Failed to save review");
    } finally {
      setReviewSubmitting(false);
    }
  };

  return (
    <>
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        <Button
          buttonType="ghost"
          buttonSize="md"
          onClick={() => toggle("favorite")}
          disabled={loading || saving}
          className="z-40"
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
        >
          {favorite ? (
            <HeartIconSolid className="h-4 w-4 text-red-500" />
          ) : (
            <HeartIcon className="h-4 w-4 text-red-500" />
          )}
        </Button>
        <Button
          buttonType="ghost"
          buttonSize="md"
          onClick={() => toggle("watchlist")}
          disabled={loading || saving}
          className="z-40"
          aria-label={watchlist ? "Remove from watchlist" : "Add to watchlist"}
          aria-pressed={watchlist}
        >
          {watchlist ? (
            <StarIconSolid className="h-4 w-4 text-yellow-500" />
          ) : (
            <StarIcon className="h-4 w-4 text-yellow-500" />
          )}
        </Button>
        <Button
          buttonType="ghost"
          buttonSize="md"
          onClick={() => toggle("watched")}
          disabled={loading || saving || (isMultiSeasonTv && !seasonDataLoaded)}
          className="z-40"
          aria-label={watched ? "Mark as unwatched" : "Mark as watched"}
          aria-pressed={watched}
        >
          {watched ? (
            <EyeIconSolid className="h-4 w-4 text-emerald-400" />
          ) : (
            <EyeIcon className="h-4 w-4 text-emerald-400" />
          )}
        </Button>
        <Button
          buttonType="ghost"
          buttonSize="md"
          onClick={toggleFollow}
          disabled={loading || saving}
          className="z-40"
          aria-label={followed ? "Unfollow release notifications" : "Follow release notifications"}
          aria-pressed={followed}
        >
          {followed ? (
            <BellIconSolid className="h-4 w-4 text-cyan-400" />
          ) : (
            <BellIcon className="h-4 w-4 text-cyan-400" />
          )}
        </Button>
        <Button
          buttonType="ghost"
          buttonSize="md"
          onClick={() => setListModalOpen(true)}
          disabled={loading}
          className="z-40"
          aria-label="Add to list"
        >
          <ListBulletIcon className="h-4 w-4 text-blue-500" />
        </Button>
      </div>
      <AddToListModal
        open={listModalOpen}
        onClose={() => setListModalOpen(false)}
        tmdbId={tmdbId}
        mediaType={mediaType}
        title={title ?? "Unknown"}
      />
      <Modal
        open={seasonModalOpen}
        onClose={() => setSeasonModalOpen(false)}
        title="Please Mark the Seasons you have watched"
        forceCenter
      >
        <div className="space-y-4">
          <div className="space-y-2">
            {availableTvSeasonOptions.map((season) => {
              const checked = selectedWatchedSeasons.includes(season.seasonNumber);
              return (
                <label
                  key={season.seasonNumber}
                  className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-colors hover:border-white/20 hover:bg-white/10"
                >
                  <span className="min-w-0 text-sm font-medium text-white">
                    {season.name?.trim() || `Season ${season.seasonNumber}`}
                  </span>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSeasonSelection(season.seasonNumber)}
                    className="h-4 w-4 rounded border-white/20 bg-slate-900 text-emerald-400 focus:ring-emerald-400"
                  />
                </label>
              );
            })}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setSeasonModalOpen(false)}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveWatchedSeasons}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save seasons
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={reviewPromptOpen}
        onClose={() => setReviewPromptOpen(false)}
        title="Leave a review?"
        forceCenter
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-300">
            {mediaType === "tv"
              ? `You marked watched progress for ${title ?? "this series"}. Want to leave a quick series review now?`
              : `You marked ${title ?? "this title"} as watched. Want to leave a quick review now?`}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setReviewPromptOpen(false)}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white"
            >
              Maybe later
            </button>
            <button
              type="button"
              onClick={() => {
                setReviewPromptOpen(false);
                setReviewComposerOpen(true);
              }}
              className="inline-flex items-center justify-center rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400"
            >
              Review now
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={reviewComposerOpen}
        onClose={() => {
          if (reviewSubmitting) return;
          setReviewComposerOpen(false);
        }}
        title={mediaType === "tv" ? "Leave a Series Review" : "Leave a Review"}
        forceCenter
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-300">
            {mediaType === "tv"
              ? `Leave a quick review for ${title ?? "this series"} without leaving the page.`
              : `Leave a quick review for ${title ?? "this title"} without leaving the page.`}
          </p>

          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, idx) => {
              const value = idx + 1;
              return (
                <button
                  key={value}
                  type="button"
                  className="rounded-md p-1"
                  onClick={() => setReviewRating(value)}
                  aria-label={`Rate ${value} stars`}
                >
                  <Star
                    className={cn(
                      "h-5 w-5",
                      value <= reviewRating ? "fill-amber-400 text-amber-400" : "text-gray-500"
                    )}
                  />
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 transition-colors focus-within:border-white/20">
            <textarea
              value={reviewText}
              onChange={(event) => setReviewText(event.target.value)}
              placeholder="Write a short review (optional)"
              disabled={reviewSubmitting}
              className="min-h-[120px] w-full resize-none bg-transparent p-3 text-sm text-white placeholder:text-gray-500 focus:outline-none"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={reviewSpoiler}
              onChange={(event) => setReviewSpoiler(event.target.checked)}
              className="accent-amber-400"
            />
            Contains spoilers
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setReviewComposerOpen(false)}
              disabled={reviewSubmitting}
              className="inline-flex items-center justify-center rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitReview}
              disabled={reviewSubmitting || reviewRating <= 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {reviewSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Post review
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
