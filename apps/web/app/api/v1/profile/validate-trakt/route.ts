import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import { getTraktConfig } from "@/db";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const { traktUsername } = body;

    if (!traktUsername || !/^[a-zA-Z0-9._-]+$/.test(String(traktUsername).trim())) {
      return NextResponse.json(
        { error: "Invalid Trakt username format" },
        { status: 400 }
      );
    }

    const username = String(traktUsername).trim();
    
    // Validate Trakt username by checking with Trakt API
    // Trakt API requires a User-Agent header
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      try {
        const traktConfig = await getTraktConfig();
        const headers: Record<string, string> = {
          "User-Agent": "LeMedia/1.0 (https://github.com/yourusername/lemedia)",
          "Accept": "application/json"
        };
        if (traktConfig.clientId) {
          headers["trakt-api-key"] = traktConfig.clientId;
          headers["trakt-api-version"] = "2";
        }

        const response = await fetch(`https://api.trakt.tv/users/${username}`, {
          method: "GET",
          headers,
          signal: controller.signal
        });

        clearTimeout(timeout);

        // Trakt returns 404 if user doesn't exist
        if (response.status === 404) {
          return NextResponse.json(
            { error: "Trakt user not found" },
            { status: 400 }
          );
        }

        // Accept 200 OK as valid
        if (response.ok) {
          return NextResponse.json({
            valid: true,
            traktUsername: username,
            message: "Trakt username verified"
          });
        }

        // For other status codes, accept the format but note we couldn't verify
        return NextResponse.json({
          valid: true,
          traktUsername: username,
          warning: "Could not verify with Trakt, but format is valid",
          message: "Trakt username format accepted"
        });
      } catch (timeoutError: any) {
        clearTimeout(timeout);
        if (timeoutError.name === "AbortError") {
          // Timeout - accept format
          return NextResponse.json({
            valid: true,
            traktUsername: username,
            warning: "Trakt verification timed out, but format is valid",
            message: "Trakt username format accepted"
          });
        }
        throw timeoutError;
      }
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      logger.warn("Could not reach Trakt for validation", { error: errorMsg });
      // If we can't reach Trakt, we'll still accept the username format
      return NextResponse.json({
        valid: true,
        traktUsername: username,
        warning: "Could not verify with Trakt, but format is valid",
        message: "Trakt username format accepted"
      });
    }
  } catch (error) {
    logger.error("Trakt validation error", { error });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
