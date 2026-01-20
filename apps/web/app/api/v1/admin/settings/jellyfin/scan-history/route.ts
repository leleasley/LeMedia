import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getRecentJellyfinScans } from "@/db";

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
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? Math.min(Number(limitParam), 50) : 10;

    const scans = await getRecentJellyfinScans(limit);

    return NextResponse.json(
      { scans },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0"
        }
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to fetch scan history" },
      { status: 500 }
    );
  }
}
