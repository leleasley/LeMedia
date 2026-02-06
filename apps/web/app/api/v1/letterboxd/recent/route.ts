import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { listLetterboxdUsernames } from "@/db";
import { fetchLetterboxdFeed } from "@/lib/letterboxd";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100);
  const filterTitle = searchParams.get("title")?.trim().toLowerCase() ?? "";
  const filterYear = searchParams.get("year") ? Number(searchParams.get("year")) : null;

  const users = await listLetterboxdUsernames(100);

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
