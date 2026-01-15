import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceTmdbRateLimit } from "../../../../_shared";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TmdbKeySchema = z.string().min(1);
let cachedKey: string | null = null;

function getTmdbApiKey(): string {
  if (!cachedKey) {
    const key = process.env.TMDB_API_KEY ?? process.env.NEXT_PUBLIC_TMDB_API_KEY;
    cachedKey = TmdbKeySchema.parse(key);
  }
  return cachedKey;
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; season: string }> }
) {
  const rateLimit = enforceTmdbRateLimit(req);
  if (rateLimit) return rateLimit;
  const params = await ctx.params;
  const id = z.coerce.number().int().parse(params.id);
  const season = z.coerce.number().int().parse(params.season);

  const url = new URL(`${TMDB_BASE}/tv/${id}/season/${season}`);
  url.searchParams.set("api_key", getTmdbApiKey());

  const res = await fetch(url, { next: { revalidate: 300 } });
  const text = await res.text();
  if (!res.ok) {
    return jsonResponseWithETag(req, { error: "tmdb_error", detail: text }, { status: 502 });
  }
  return new NextResponse(text, { headers: { "Content-Type": "application/json" } });
}
