"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import Image from "next/image";
import { Star, Loader2, Trash2, EyeOff, Eye } from "lucide-react";
import { formatDate } from "@/lib/dateFormat";
import { tmdbImageUrl } from "@/lib/tmdb-images";
import { cn } from "@/lib/utils";
import { csrfFetch } from "@/lib/csrf-client";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface MediaReviewsProps {
  tmdbId: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null | undefined;
  releaseYear?: number | string | null;
  imageProxyEnabled: boolean;
}

interface ReviewUser {
  id: number;
  username: string;
  avatarUrl: string | null;
  groups: string[];
}

interface Review {
  id: number;
  userId: number;
  mediaType: "movie" | "tv";
  tmdbId: number;
  rating: number;
  reviewText: string | null;
  spoiler: boolean;
  title: string;
  posterPath: string | null;
  releaseYear: number | null;
  createdAt: string;
  updatedAt: string;
  user: ReviewUser;
}

interface ReviewsResponse {
  stats: { total: number; average: number };
  reviews: Review[];
  userReview: {
    id: number;
    rating: number;
    reviewText: string | null;
    spoiler: boolean;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export function MediaReviews({ tmdbId, mediaType, title, posterPath, releaseYear, imageProxyEnabled }: MediaReviewsProps) {
  const { data, isLoading, mutate } = useSWR<ReviewsResponse>(
    `/api/v1/reviews/${mediaType}/${tmdbId}`,
    fetcher
  );
  const letterboxdUrl = useMemo(() => {
    if (mediaType !== "movie") return null;
    const params = new URLSearchParams();
    params.set("limit", "4");
    params.set("title", title);
    const yearValue = typeof releaseYear === "string" ? Number(releaseYear) : releaseYear ?? null;
    if (yearValue && Number.isFinite(yearValue)) {
      params.set("year", String(yearValue));
    }
    return `/api/v1/letterboxd/recent?${params.toString()}`;
  }, [mediaType, releaseYear, title]);
  const { data: letterboxdData } = useSWR<{ reviews: { username: string; title: string; year: number | null; link: string; publishedAt: string; rating: number | null; reviewText: string | null; }[] }>(
    letterboxdUrl,
    fetcher
  );
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [spoiler, setSpoiler] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const userReview = data?.userReview ?? null;

  useEffect(() => {
    if (userReview) {
      setRating(userReview.rating);
      setReviewText(userReview.reviewText ?? "");
      setSpoiler(userReview.spoiler ?? false);
    } else {
      setRating(0);
      setReviewText("");
      setSpoiler(false);
    }
  }, [userReview?.id]);

  const averageDisplay = useMemo(() => {
    if (!data?.stats?.total) return null;
    return data.stats.average.toFixed(1);
  }, [data?.stats?.average, data?.stats?.total]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating <= 0) return;

    setSubmitting(true);
    try {
      const response = await csrfFetch("/api/v1/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mediaType,
          tmdbId,
          rating,
          reviewText: reviewText.trim() || null,
          spoiler,
          title,
          posterPath: posterPath ?? null,
          releaseYear: typeof releaseYear === "string" ? Number(releaseYear) || null : releaseYear ?? null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to save review");
        return;
      }

      await mutate();
    } catch (err) {
      console.error("Error saving review:", err);
      alert("Failed to save review");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!userReview) return;
    setSubmitting(true);
    try {
      const response = await csrfFetch(`/api/v1/reviews/review/${userReview.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const error = await response.json();
        alert(error.error || "Failed to delete review");
        return;
      }
      await mutate();
    } catch (err) {
      console.error("Error deleting review:", err);
      alert("Failed to delete review");
    } finally {
      setSubmitting(false);
    }
  };

  const reviews = data?.reviews ?? [];
  const posterUrl = tmdbImageUrl(posterPath ?? null, "w300", imageProxyEnabled);
  const letterboxdReviews = letterboxdData?.reviews ?? [];

  return (
    <div className="mt-10">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg sm:text-xl font-semibold text-white">Reviews</h3>
          <p className="text-sm text-gray-400">Share your thoughts and see what others say.</p>
        </div>
        <div className="flex items-center gap-3">
          {averageDisplay && (
            <div className="glass-strong rounded-full px-3 py-1 text-xs font-semibold text-amber-200 border border-amber-500/30">
              {averageDisplay} ★ ({data?.stats?.total ?? 0})
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <form onSubmit={handleSubmit} className="glass-strong rounded-xl border border-white/10 p-4 space-y-4">
          <div className="flex items-center gap-3">
            {posterUrl ? (
              <div className="relative h-16 w-12 overflow-hidden rounded-md border border-white/10">
                <Image src={posterUrl} alt={title} fill className="object-cover" />
              </div>
            ) : (
              <div className="h-16 w-12 rounded-md bg-white/5" />
            )}
            <div>
              <div className="text-sm font-semibold text-white">Your review</div>
              <div className="text-xs text-gray-400">Rate {title}</div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, idx) => {
              const value = idx + 1;
              return (
                <button
                  key={value}
                  type="button"
                  className="p-1"
                  onClick={() => setRating(value)}
                  aria-label={`Rate ${value} stars`}
                >
                  <Star
                    className={cn(
                      "h-5 w-5",
                      value <= rating ? "text-amber-400 fill-amber-400" : "text-gray-500"
                    )}
                  />
                </button>
              );
            })}
          </div>

          <div className="glass-strong rounded-lg border border-white/10 focus-within:border-white/20 transition-colors">
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="Write a short review (optional)"
              disabled={submitting}
              className="w-full bg-transparent text-white placeholder-gray-500 p-3 resize-none focus:outline-none text-sm"
              rows={4}
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={spoiler}
              onChange={(e) => setSpoiler(e.target.checked)}
              className="accent-amber-400"
            />
            Contains spoilers
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={submitting || rating <= 0}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-amber-500/90 text-white text-sm font-semibold py-2 hover:bg-amber-500 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {userReview ? "Update Review" : "Post Review"}
            </button>
            {userReview && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </form>

        <div className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center rounded-xl border border-white/5 bg-white/5 p-6 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : reviews.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-gray-400">
              No reviews yet. Be the first to review this title.
            </div>
          ) : (
            reviews.map((review) => {
              const isSpoilerHidden = review.spoiler && !revealed[review.id];
              return (
                <div key={review.id} className="glass-strong rounded-xl border border-white/10 p-4">
                  <div className="flex items-center gap-3">
                    {review.user.avatarUrl ? (
                      <div className="relative h-9 w-9 overflow-hidden rounded-full">
                        <Image src={review.user.avatarUrl} alt={review.user.username} fill className="object-cover" />
                      </div>
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold">
                        {review.user.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{review.user.username}</span>
                        <span className="text-xs text-gray-400">{formatDate(review.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, idx) => (
                          <Star
                            key={idx}
                            className={cn(
                              "h-3.5 w-3.5",
                              idx < review.rating ? "text-amber-400 fill-amber-400" : "text-gray-600"
                            )}
                          />
                        ))}
                      </div>
                    </div>
                    {review.spoiler && (
                      <button
                        type="button"
                        onClick={() => setRevealed((prev) => ({ ...prev, [review.id]: !prev[review.id] }))}
                        className="flex items-center gap-1 text-xs text-gray-400 hover:text-white"
                      >
                        {isSpoilerHidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                        {isSpoilerHidden ? "Show" : "Hide"}
                      </button>
                    )}
                  </div>

                  {review.reviewText && (
                    <p className={cn("mt-3 text-sm text-gray-200", isSpoilerHidden && "blur-sm select-none")}
                       aria-hidden={isSpoilerHidden}>
                      {review.reviewText}
                    </p>
                  )}
                </div>
              );
            })
          )}

          {mediaType === "movie" && letterboxdReviews.length > 0 && (
            <div className="glass-strong rounded-xl border border-white/10 p-4">
              <div className="text-sm font-semibold text-white mb-2">Letterboxd activity</div>
              <div className="space-y-2">
                {letterboxdReviews.map((item, idx) => (
                  <div key={`${item.link}-${idx}`} className="rounded-lg border border-white/5 bg-white/5 p-3">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>@{item.username}</span>
                      {item.rating !== null && <span className="text-amber-200">{item.rating} ★</span>}
                    </div>
                    {item.reviewText && (
                      <p className="mt-1 text-xs text-gray-300 line-clamp-2">{item.reviewText}</p>
                    )}
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block text-xs text-indigo-300 hover:text-indigo-200"
                    >
                      View on Letterboxd
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
