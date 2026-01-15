import { NextRequest } from "next/server";
import { getUser } from "@/auth";
import { getRequestCounts } from "@/db";
import { cacheableJsonResponseWithETag, jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  const user = await getUser().catch(() => null);
  if (!user || !user.isAdmin) {
    return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
  }

  const counts = await getRequestCounts();
  return cacheableJsonResponseWithETag(
    req,
    {
      ...counts,
      tv: counts.episode
    },
    { maxAge: 10, sMaxAge: 0, private: true }
  );
}
