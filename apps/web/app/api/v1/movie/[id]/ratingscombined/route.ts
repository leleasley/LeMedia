import { NextRequest } from "next/server";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

// Overseerr-compatible combined ratings endpoint
export async function GET(req: NextRequest) {
  return cacheableJsonResponseWithETag(req, {
    criticsRating: null,
    criticsScore: null,
    audienceRating: null,
    audienceScore: null
  }, { maxAge: 3600, sMaxAge: 7200 });
}
