import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { listMediaIssues } from "@/db";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  const user = await getUser().catch(() => null);
  if (!user || !user.isAdmin) {
    return jsonResponseWithETag(req, { error: "Forbidden" }, { status: 403 });
  }
  const issues = await listMediaIssues(500);
  return jsonResponseWithETag(req, { issues });
}
