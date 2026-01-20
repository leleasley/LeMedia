import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { triggerManualAvailabilitySync } from "@/lib/jellyfin-availability-sync";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  return null;
}

export async function POST(req: NextRequest) {
  const forbidden = await ensureAdmin();
  if (forbidden) return forbidden;

  try {
    // Trigger the sync in the background
    triggerManualAvailabilitySync().catch((err) => {
      console.error("[Jellyfin Availability Sync] Manual sync failed", err);
    });

    return NextResponse.json(
      { message: "Availability sync started" },
      { status: 202 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to start availability sync" },
      { status: 500 }
    );
  }
}
