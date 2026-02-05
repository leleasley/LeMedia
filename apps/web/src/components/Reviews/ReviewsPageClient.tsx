"use client";

import useSWR from "swr";
import Image from "next/image";
import Link from "next/link";
import { Star, Loader2, ExternalLink } from "lucide-react";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { formatDate } from "@/lib/dateFormat";
import { tmdbImageUrl } from "@/lib/tmdb-images";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface ReviewUser {
  id: number;
  username: string;
  avatarUrl: string | null;
  groups: string[];
}

interface LocalReview {
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

interface LetterboxdReview {
  username: string;
  title: string;
  year: number | null;
  link: string;
  publishedAt: string;
  rating: number | null;
  reviewText: string | null;
}

interface ReviewsPageClientProps {
  imageProxyEnabled: boolean;
}

export function ReviewsPageClient({ imageProxyEnabled }: ReviewsPageClientProps) {
  const { data: localData, isLoading: localLoading } = useSWR<{ reviews: LocalReview[] }>(
    "/api/v1/reviews?limit=20",
    fetcher
  );
  const { data: letterboxdData, isLoading: letterboxdLoading } = useSWR<{ reviews: LetterboxdReview[] }>(
    "/api/v1/letterboxd/recent?limit=15",
    fetcher
  );

  const localReviews = localData?.reviews ?? [];
  const letterboxdReviews = letterboxdData?.reviews ?? [];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Reviews</h1>
        <p className="text-sm text-gray-400">Community reviews from LeMedia and Letterboxd.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">LeMedia Reviews</h2>
            <span className="text-xs text-gray-500">Latest community thoughts</span>
          </div>

          {localLoading ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex items-center justify-center text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : localReviews.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-gray-400">
              No reviews yet. Be the first to share your thoughts.
            </div>
          ) : (
            <div className="space-y-3">
              {localReviews.map((review) => {
                const posterUrl = tmdbImageUrl(review.posterPath ?? null, "w300", imageProxyEnabled);
                const href = review.mediaType === "movie" ? `/movie/${review.tmdbId}` : `/tv/${review.tmdbId}`;
                return (
                  <div key={review.id} className="glass-strong rounded-xl border border-white/10 p-4">
                    <div className="flex gap-4">
                      {posterUrl ? (
                        <div className="relative h-20 w-14 overflow-hidden rounded-md border border-white/10">
                          <Image src={posterUrl} alt={review.title} fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="h-20 w-14 rounded-md bg-white/5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <PrefetchLink href={href} className="text-sm font-semibold text-white hover:text-indigo-300 line-clamp-1">
                            {review.title} {review.releaseYear ? `(${review.releaseYear})` : ""}
                          </PrefetchLink>
                          <span className="text-xs text-gray-400">{formatDate(review.createdAt)}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          {Array.from({ length: 5 }).map((_, idx) => (
                            <Star key={idx} className={idx < review.rating ? "h-3.5 w-3.5 text-amber-400 fill-amber-400" : "h-3.5 w-3.5 text-gray-600"} />
                          ))}
                          <span className="text-xs text-gray-500 ml-1">by {review.user.username}</span>
                        </div>
                        {review.reviewText && (
                          <p className="mt-2 text-sm text-gray-300 line-clamp-3">
                            {review.reviewText}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Letterboxd Activity</h2>
            <span className="text-xs text-gray-500">From linked accounts</span>
          </div>

          {letterboxdLoading ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 flex items-center justify-center text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : letterboxdReviews.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-sm text-gray-400">
              No Letterboxd activity found. Add usernames to enable the feed.
            </div>
          ) : (
            <div className="space-y-3">
              {letterboxdReviews.map((review, idx) => (
                <div key={`${review.link}-${idx}`} className="glass-strong rounded-xl border border-white/10 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white line-clamp-1">
                      {review.title} {review.year ? `(${review.year})` : ""}
                    </div>
                    <Link
                      href={review.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-300 hover:text-indigo-200 inline-flex items-center gap-1"
                    >
                      View <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                    <span>@{review.username}</span>
                    <span>•</span>
                    <span>{formatDate(review.publishedAt)}</span>
                    {review.rating !== null && (
                      <span className="ml-auto text-amber-200">{review.rating} ★</span>
                    )}
                  </div>
                  {review.reviewText && (
                    <p className="mt-2 text-sm text-gray-300 line-clamp-3">
                      {review.reviewText}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
