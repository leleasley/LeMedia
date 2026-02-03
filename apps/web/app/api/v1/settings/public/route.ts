import { NextRequest } from "next/server";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

// Overseerr-compatible endpoint for external integrations (like Wholphin)
// Returns whether the application has been initialized
export async function GET(req: NextRequest) {
  // LeMedia is always initialized if the app is running
  return cacheableJsonResponseWithETag(
    req,
    { initialized: true },
    { maxAge: 60, sMaxAge: 120 }
  );
}
