import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJellyfinScanStatus, startJellyfinLibraryScan, cancelJellyfinLibraryScan } from "@/lib/jellyfin-scan";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  return null;
}

export async function GET() {
  const forbidden = await ensureAdmin();
  if (forbidden) return forbidden;
  const status = await getJellyfinScanStatus();
  return NextResponse.json(status);
}

export async function POST(req: NextRequest) {
  const forbidden = await ensureAdmin();
  if (forbidden) return forbidden;
  const body = await req.json().catch(() => ({}));
  if (body?.start) {
    await startJellyfinLibraryScan();
  }
  if (body?.cancel) {
    cancelJellyfinLibraryScan();
  }
  const status = await getJellyfinScanStatus();
  return NextResponse.json(status);
}
