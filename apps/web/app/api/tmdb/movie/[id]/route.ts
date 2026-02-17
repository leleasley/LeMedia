import { NextRequest } from "next/server";
import { z } from "zod";
import { enforceTmdbRateLimit } from "../../_shared";
import { getMovie } from "@/lib/tmdb";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

const Params = z.object({ id: z.coerce.number().int().positive() });

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") {
    return await params;
  }
  return params;
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  try {
    const rateLimit = await enforceTmdbRateLimit(req);
    if (rateLimit) return rateLimit;

    const resolved = await resolveParams(params);
    const parsed = Params.safeParse(resolved);
    if (!parsed.success) {
      return cacheableJsonResponseWithETag(
        req,
        { error: "Invalid movie id" },
        { maxAge: 0, private: true }
      );
    }

    const movie = await getMovie(parsed.data.id);
    return cacheableJsonResponseWithETag(req, movie, { maxAge: 300, sMaxAge: 600 });
  } catch {
    return cacheableJsonResponseWithETag(req, { error: "Failed to load movie data" }, { maxAge: 0 });
  }
}
