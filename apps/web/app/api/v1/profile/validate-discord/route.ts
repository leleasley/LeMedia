import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getPool } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const { discordUserId } = body;

    if (!discordUserId || !/^\d+$/.test(String(discordUserId).trim())) {
      return NextResponse.json(
        { error: "Invalid Discord ID format" },
        { status: 400 }
      );
    }

    // Validate Discord ID by fetching user info from Discord API
    // Discord IDs are numeric strings, valid user IDs are 17-19 digits
    const idStr = String(discordUserId).trim();
    if (idStr.length < 17 || idStr.length > 19) {
      return NextResponse.json(
        { error: "Discord ID must be between 17-19 digits" },
        { status: 400 }
      );
    }

    // For now, we'll accept the ID format as valid
    // In production, you could verify with Discord's API if you have a bot token
    // But that requires authentication and rate limiting
    
    return NextResponse.json({
      valid: true,
      discordUserId: idStr,
      message: "Discord ID format is valid"
    });
  } catch (error) {
    logger.error("Error validating Discord ID", error);
    return NextResponse.json(
      { error: "Failed to validate Discord ID" },
      { status: 500 }
    );
  }
}
