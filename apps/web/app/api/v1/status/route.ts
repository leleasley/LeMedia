import { NextRequest } from "next/server";
import { verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getUser } from "@/auth";

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || req.nextUrl.searchParams.get("api_key")
    || "";
}

export async function GET(req: NextRequest) {
  const user = await getUser().catch(() => null);
  const isAdmin = Boolean(user?.isAdmin);
  if (!isAdmin) {
    const apiKey = extractApiKey(req);
    const ok = apiKey ? await verifyExternalApiKey(apiKey) : false;
    if (!ok) {
      return cacheableJsonResponseWithETag(req, { error: "Unauthorized" }, { maxAge: 0, private: true });
    }
  }

  return cacheableJsonResponseWithETag(req, {
    version: process.env.APP_VERSION ?? "0.1.0",
    commitTag: process.env.COMMIT_TAG ?? "local",
    updateAvailable: false,
    commitsBehind: 0,
    restartRequired: false
  }, { maxAge: 60, sMaxAge: 120 });
}
