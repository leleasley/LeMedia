import { NextRequest } from "next/server";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

// Overseerr-compatible ratings endpoint
// Returns empty ratings for now (can be enhanced later with Rotten Tomatoes/IMDb integration)
export async function GET(req: NextRequest) {
  return cacheableJsonResponseWithETag(req, {
    criticsRating: null,
    criticsScore: null,
    audienceRating: null,
    audienceScore: null
  }, { maxAge: 3600, sMaxAge: 7200 });
}
