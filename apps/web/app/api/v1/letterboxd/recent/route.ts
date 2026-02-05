import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";
import { requireUser } from "@/auth";
import { listLetterboxdUsernames } from "@/db";

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

async function fetchLetterboxdFeed(username: string) {
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
    };
  });
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100);
  const filterTitle = searchParams.get("title")?.trim().toLowerCase() ?? "";
  const filterYear = searchParams.get("year") ? Number(searchParams.get("year")) : null;

  const dbUsers = await listLetterboxdUsernames(100);
  const envUsers = (process.env.LEMEDIA_LETTERBOXD_USERS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const users = dbUsers.length ? dbUsers : envUsers;

  if (!users.length) {
    return NextResponse.json({ reviews: [] }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" }
    });
  }

  const results = await Promise.all(users.map(fetchLetterboxdFeed));
  const merged = results.flat();

  const filtered = merged.filter((item) => {
    if (filterTitle && !item.title.toLowerCase().includes(filterTitle)) return false;
    if (filterYear && item.year && item.year !== filterYear) return false;
    if (filterYear && !item.year) return false;
    return true;
  });

  const sorted = filtered.sort((a, b) => {
    const da = new Date(a.publishedAt).getTime();
    const db = new Date(b.publishedAt).getTime();
    return db - da;
  });

  return NextResponse.json(
    { reviews: sorted.slice(0, limit) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600"
      }
    }
  );
}
