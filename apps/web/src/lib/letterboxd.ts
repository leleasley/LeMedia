import "server-only";
import { XMLParser } from "fast-xml-parser";
import { listUsersWithLetterboxd, getUserReviewForMedia, upsertUserReview } from "@/db";
import { searchMovie } from "@/lib/tmdb";
import { logger } from "@/lib/logger";

export type LetterboxdReview = {
  username: string;
  title: string;
  year: number | null;
  link: string;
  publishedAt: string;
  rating: number | null;
  reviewText: string | null;
};

const parser = new XMLParser({
  ignoreAttributes: false,
});

const stripHtml = (input: string) =>
  input
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractRating = (input: string) => {
  const starMatch = input.match(/Rated\s*([★½]+)/i) ?? input.match(/([★]{1,5})(½)?/);
  if (!starMatch) return null;
  const stars = (starMatch[1] || "").match(/★/g)?.length ?? 0;
  const hasHalf = starMatch[0].includes("½");
  if (!stars && !hasHalf) return null;
  return stars + (hasHalf ? 0.5 : 0);
};

const parseTitleYear = (rawTitle: string) => {
  const match = rawTitle.match(/^(.*)\s+\((\d{4})\)$/);
  if (!match) return { title: rawTitle.trim(), year: null as number | null };
  return { title: match[1].trim(), year: Number(match[2]) };
};

export async function fetchLetterboxdFeed(username: string): Promise<LetterboxdReview[]> {
  const res = await fetch(`https://letterboxd.com/${username}/rss/`, { cache: "no-store" });
  if (!res.ok) return [];
  const xml = await res.text();
  const data = parser.parse(xml);
  const items = data?.rss?.channel?.item ?? [];
  const normalized = Array.isArray(items) ? items : [items];

  return normalized.map((item: any) => {
    const rawTitle = String(item?.title ?? "");
    const { title, year } = parseTitleYear(rawTitle);
    const description = String(item?.description ?? "");
    const text = stripHtml(description);
    return {
      username,
      title,
      year,
      link: String(item?.link ?? ""),
      publishedAt: String(item?.pubDate ?? item?.["dc:date"] ?? new Date().toISOString()),
      rating: extractRating(description) ?? extractRating(text),
      reviewText: text || null,
    } as LetterboxdReview;
  });
}

function normalizeRating(rating: number | null): number | null {
  if (!rating || !Number.isFinite(rating)) return null;
  const rounded = Math.round(rating);
  if (rounded < 1) return 1;
  if (rounded > 5) return 5;
  return rounded;
}

export async function importLetterboxdReviews(options?: { userId?: number; limitPerUser?: number }) {
  const limit = options?.limitPerUser ?? 20;
  const users = await listUsersWithLetterboxd();
  const filtered = typeof options?.userId === "number"
    ? users.filter(u => u.id === options.userId)
    : users;

  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of filtered) {
    try {
      const feed = await fetchLetterboxdFeed(user.letterboxdUsername);
      const recent = feed.slice(0, limit);

      for (const entry of recent) {
        const rating = normalizeRating(entry.rating);
        if (!rating) {
          skipped++;
          continue;
        }

        const search = await searchMovie(entry.title, entry.year ?? undefined);
        const match = Array.isArray(search?.results) ? search.results[0] : null;
        const tmdbId = match?.id ? Number(match.id) : null;
        if (!tmdbId || Number.isNaN(tmdbId)) {
          skipped++;
          continue;
        }

        const existing = await getUserReviewForMedia(user.id, "movie", tmdbId);
        if (existing) {
          skipped++;
          continue;
        }

        await upsertUserReview({
          userId: user.id,
          mediaType: "movie",
          tmdbId,
          rating,
          reviewText: entry.reviewText ?? null,
          spoiler: false,
          title: match?.title ?? entry.title,
          posterPath: match?.poster_path ?? null,
          releaseYear: match?.release_date ? new Date(match.release_date).getFullYear() : entry.year ?? null
        });
        imported++;
      }
    } catch (err) {
      errors++;
      logger.warn("[letterboxd] Failed to import reviews", { userId: user.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { imported, skipped, errors };
}
