import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { listAdminWatchParties } from "@/db/watch-party";

export async function GET(req: Request) {
  const user = await getUser().catch(() => null);
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const limitParam = Number.parseInt(url.searchParams.get("limit") || "100", 10);
  const limit = Number.isFinite(limitParam) ? limitParam : 100;

  const parties = await listAdminWatchParties(limit);
  return NextResponse.json({ parties });
}
