import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJellyfinConfig, setJellyfinConfig } from "@/db";
import { fetchJellyfinServerInfo, getJellyfinBaseUrl, getJellyfinApiKey } from "@/lib/jellyfin-admin";
import { invalidateJellyfinCaches } from "@/lib/jellyfin";
import { logger } from "@/lib/logger";

/**
 * Admin endpoint to fetch and populate missing Jellyfin serverId
 * GET /api/admin/jellyfin/fix-serverid
 */
export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  try {
    const config = await getJellyfinConfig();

    // Check if serverId already exists
    if (config.serverId && config.serverId.trim() !== "") {
      return NextResponse.json({
        ok: true,
        message: "ServerId already populated",
        serverId: config.serverId
      });
    }

    // Fetch serverId from Jellyfin
    const baseUrl = await getJellyfinBaseUrl();
    const apiKey = await getJellyfinApiKey();

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { error: "Jellyfin not configured properly" },
        { status: 400 }
      );
    }

    const serverInfo = await fetchJellyfinServerInfo(baseUrl, apiKey);

    if (!serverInfo.id) {
      return NextResponse.json(
        { error: "Failed to fetch serverId from Jellyfin" },
        { status: 502 }
      );
    }

    // Update config with serverId
    await setJellyfinConfig({
      ...config,
      serverId: serverInfo.id,
      name: serverInfo.name || config.name
    });
    invalidateJellyfinCaches("jellyfin serverId updated");

    return NextResponse.json({
      ok: true,
      message: "ServerId populated successfully",
      serverId: serverInfo.id,
      serverName: serverInfo.name
    });
  } catch (error) {
    logger.error("[Jellyfin Fix ServerId] Error", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
