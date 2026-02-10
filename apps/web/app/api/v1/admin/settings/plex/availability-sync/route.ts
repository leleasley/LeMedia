import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { triggerManualPlexAvailabilitySync } from "@/lib/plex-availability-sync";
import { requireCsrf } from "@/lib/csrf";
import { getPlexConfig } from "@/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function ensureAdmin() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  return null;
}

export async function POST(req: NextRequest) {
  const forbidden = await ensureAdmin();
  if (forbidden) return forbidden;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const config = await getPlexConfig();
  if (!config.enabled) {
    return NextResponse.json({ error: "PLEX_DISABLED" }, { status: 409 });
  }

  try {
    triggerManualPlexAvailabilitySync().catch((err) => {
      logger.error("[Plex Availability Sync] Manual sync failed", err);
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
