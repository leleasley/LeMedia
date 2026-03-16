import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { listUserEpisodeReminderDeliveries } from "@/db";

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 10;
  return Math.min(parsed, 50);
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const items = await listUserEpisodeReminderDeliveries(user.id, limit);

  const response = NextResponse.json({ items });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
