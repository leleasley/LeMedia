import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getNewJellyfinItems } from "@/db";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  return null;
}

export async function GET(req: NextRequest) {
  const forbidden = await ensureAdmin();
  if (forbidden) return forbidden;

  try {
    const url = new URL(req.url);
    const sinceParam = url.searchParams.get("since");
    const limitParam = url.searchParams.get("limit");

    let sinceDate: Date | undefined;
    if (sinceParam) {
      const timestamp = Number(sinceParam);
      if (!isNaN(timestamp)) {
        sinceDate = new Date(timestamp);
      }
    }

    const limit = limitParam ? Math.min(Number(limitParam), 500) : 100;

    const newItems = await getNewJellyfinItems(sinceDate, limit);

    return NextResponse.json(
      { newItems },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch new items" },
      { status: 500 }
    );
  }
}
