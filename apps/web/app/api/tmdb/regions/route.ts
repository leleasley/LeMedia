import { NextRequest } from "next/server";
import { getRegions } from "@/lib/tmdb";
import { enforceTmdbRateLimit } from "../_shared";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  try {
    const rateLimit = enforceTmdbRateLimit(req);
    if (rateLimit) return rateLimit;
    const regions = await getRegions();
    return jsonResponseWithETag(req, { regions });
  } catch (e) {
    return jsonResponseWithETag(req, { error: "Failed to load regions" }, { status: 500 });
  }
}
