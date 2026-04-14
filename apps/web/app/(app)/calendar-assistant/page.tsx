import { redirect } from "next/navigation";
import Image from "next/image";
import { getUser } from "@/auth";
import { getLatestCalendarAssistantNotification, getReviewStatsForMedia, getUserWithHash } from "@/db";
import { formatDistanceToNow } from "date-fns";
import { PrefetchLink } from "@/components/Layout/PrefetchLink";
import { getMovie, getTv } from "@/lib/tmdb";
import { tmdbImageUrl } from "@/lib/tmdb-images";
import { getImageProxyEnabled } from "@/lib/app-settings";
import BackdropRotator from "./BackdropRotator";

type CalendarDigestItem = {
  mediaType?: string;
  tmdbId?: number;
  title?: string;
  date?: string;
};

type EnrichedDigestItem = {
  mediaType: "movie" | "tv";
  tmdbId: number | null;
  title: string;
  date: string | null;
  overview: string | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  tmdbRating: number | null;
  reviewTotal: number;
  reviewAverage: number;
};

export const metadata = {
  title: "Calendar Assistant - LeMedia",
};

function parseDigestItems(metadata: Record<string, unknown> | null): CalendarDigestItem[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { items?: unknown }).items;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (item && typeof item === "object" ? (item as CalendarDigestItem) : null))
    .filter((item): item is CalendarDigestItem => !!item)
    .slice(0, 6);
}

function formatDigestDate(value: string | null) {
  if (!value) return "Date TBA";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

async function enrichDigestItem(item: CalendarDigestItem, imageProxyEnabled: boolean): Promise<EnrichedDigestItem> {
  const mediaType: "movie" | "tv" = item.mediaType === "tv" ? "tv" : "movie";
  const tmdbId = Number(item.tmdbId ?? 0) || null;

  if (!tmdbId) {
    return {
      mediaType,
      tmdbId: null,
      title: item.title ?? "Untitled",
      date: item.date ?? null,
      overview: null,
      posterUrl: null,
      backdropUrl: null,
      tmdbRating: null,
      reviewTotal: 0,
      reviewAverage: 0,
    };
  }

  const [tmdbDetail, reviewStats] = await Promise.all([
    (mediaType === "movie" ? getMovie(tmdbId) : getTv(tmdbId)).catch(() => null),
    getReviewStatsForMedia(mediaType, tmdbId).catch(() => ({ total: 0, average: 0 })),
  ]);

  return {
    mediaType,
    tmdbId,
    title:
      String(
        item.title ??
          tmdbDetail?.title ??
          tmdbDetail?.name ??
          "Untitled"
      ),
    date: item.date ?? tmdbDetail?.release_date ?? tmdbDetail?.first_air_date ?? null,
    overview: tmdbDetail?.overview ? String(tmdbDetail.overview) : null,
    posterUrl: tmdbImageUrl(tmdbDetail?.poster_path ?? null, "w342", imageProxyEnabled),
    backdropUrl: tmdbImageUrl(tmdbDetail?.backdrop_path ?? null, "w780", imageProxyEnabled),
    tmdbRating: typeof tmdbDetail?.vote_average === "number" ? tmdbDetail.vote_average : null,
    reviewTotal: Number(reviewStats.total ?? 0),
    reviewAverage: Number(reviewStats.average ?? 0),
  };
}

export default async function CalendarAssistantPage() {
  const user = await getUser().catch(() => null);
  if (!user) redirect("/login");

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) redirect("/login");

  const notification = await getLatestCalendarAssistantNotification(dbUser.id);
  const items = parseDigestItems(notification?.metadata ?? null);
  const imageProxyEnabled = await getImageProxyEnabled().catch(() => true);
  const enrichedItems = await Promise.all(items.map((item) => enrichDigestItem(item, imageProxyEnabled)));
  const rotatingBackdrops = enrichedItems
    .map((item) => item.backdropUrl)
    .filter((url): url is string => !!url);

  return (
    <div className="relative min-h-screen overflow-hidden -mt-[7rem] pt-[8rem] pb-16">
      <BackdropRotator images={rotatingBackdrops} intervalMs={9000} />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(3,9,20,0.52)_0%,rgba(3,9,20,0.72)_35%,rgba(2,7,17,0.9)_70%,rgba(2,6,14,0.97)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(21,87,145,0.28),rgba(3,8,18,0)_45%)]" />

      <div className="relative z-10 w-full px-3 sm:px-4 md:px-8">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-4xl">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Calendar Assistant</p>
            <h1 className="mt-2 text-3xl font-bold text-white md:text-5xl">Your latest release radar</h1>
            <p className="mt-3 text-sm text-white/80 md:text-lg">
              Rich preview of your latest digest with ratings, community sentiment, release dates, and fast links.
            </p>
          </div>
          <PrefetchLink
            href="/settings/profile/notifications"
            className="rounded-xl border border-white/20 bg-black/25 px-3.5 py-2 text-sm font-medium text-white/90 backdrop-blur hover:bg-black/35"
          >
            Notification settings
          </PrefetchLink>
        </div>

        {!notification ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5 text-amber-100 backdrop-blur">
            <p className="text-sm font-semibold">No active Calendar Assistant digest found</p>
            <p className="mt-1 text-sm text-amber-100/85">
              Send a test from profile settings or wait for your scheduled digest.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8 border-y border-white/15 bg-black/30 px-4 py-5 backdrop-blur-sm md:px-6">
              <div className="mb-2 inline-flex rounded-full border border-cyan-300/35 bg-cyan-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-100">
                Live digest snapshot
              </div>
              <p className="text-base font-semibold text-white md:text-lg">{notification.title}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-white/88 md:text-base">{notification.message}</p>
              <p className="mt-3 text-xs text-white/60">
                Generated {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
              </p>
            </div>

            {enrichedItems.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {enrichedItems.map((item, idx) => {
                  const href = item.tmdbId ? `/${item.mediaType}/${item.tmdbId}` : null;
                  const reviewsHref = href ? `${href}#reviews` : null;
                  return (
                    <div key={`${item.tmdbId ?? "na"}-${idx}`} className="border border-white/12 bg-black/28 backdrop-blur-sm">
                      <div className="flex gap-4 p-4">
                        <div className="h-28 w-20 flex-shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/30">
                          {item.posterUrl ? (
                            <Image
                              src={item.posterUrl}
                              alt={`${item.title} poster`}
                              width={160}
                              height={240}
                              className="h-full w-full object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-white/35">No image</div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-base font-semibold text-white">{item.title}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-white/50">{item.mediaType}</p>
                          <p className="mt-2 text-sm text-white/80">{formatDigestDate(item.date)}</p>

                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-white/90">
                              TMDB: {item.tmdbRating !== null ? item.tmdbRating.toFixed(1) : "N/A"}
                            </span>
                            <span className="rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-white/90">
                              Reviews: {item.reviewTotal > 0 ? `${item.reviewAverage.toFixed(1)} (${item.reviewTotal})` : "none yet"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {item.overview ? (
                        <p className="border-t border-white/10 px-4 py-3 text-sm leading-6 text-white/75">{item.overview}</p>
                      ) : null}

                      <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
                        {href ? (
                          <PrefetchLink href={href} className="rounded-lg border border-cyan-300/35 bg-cyan-500/12 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/22">
                            Open title
                          </PrefetchLink>
                        ) : null}
                        {reviewsHref ? (
                          <PrefetchLink href={reviewsHref} className="rounded-lg border border-white/20 bg-white/[0.08] px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/[0.14]">
                            View reviews
                          </PrefetchLink>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
