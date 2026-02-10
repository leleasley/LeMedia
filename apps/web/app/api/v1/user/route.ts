import { NextRequest, NextResponse } from "next/server";
import { searchUsersByJellyfinUsername } from "@/db";
import { extractExternalApiKey, verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\\s+/i, "")
    || extractExternalApiKey(req)
    || "";
}

export async function GET(req: NextRequest) {
  const apiKey = extractApiKey(req);
  const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
  if (!ok) {
    return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!q) {
    return cacheableJsonResponseWithETag(req, { results: [], pageInfo: { results: 0, pages: 1, page: 1, pageSize: 0 } }, { maxAge: 60, private: true });
  }

  const matches = await searchUsersByJellyfinUsername(q);
  const results = matches.map(user => ({
    id: user.id,
    username: user.username,
    jellyfinUsername: user.jellyfin_username ?? user.username
  }));

  return cacheableJsonResponseWithETag(req, {
    results,
    pageInfo: {
      results: results.length,
      pages: 1,
      page: 1,
      pageSize: results.length
    }
  }, { maxAge: 60, private: true });
}
