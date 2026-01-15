import type { NextRequest } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/rate-limit";

const pageSchema = z.number().int().positive().max(500);
const tmdbRateLimit = {
  windowMs: 60 * 1000,
  max: Math.max(1, Number(process.env.TMDB_RATE_LIMIT_MAX ?? "300") || 300),
};

export function parsePage(req: NextRequest): number {
  const raw = req.nextUrl.searchParams.get("page") ?? "1";
  return pageSchema.parse(Number(raw));
}

export function enforceTmdbRateLimit(req: NextRequest) {
  return enforceRateLimit(req, "tmdb", tmdbRateLimit);
}
