import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const { letterboxdUsername } = body;

    if (!letterboxdUsername || !/^[a-zA-Z0-9._-]+$/.test(String(letterboxdUsername).trim())) {
      return NextResponse.json(
        { error: "Invalid Letterboxd username format" },
        { status: 400 }
      );
    }

    const username = String(letterboxdUsername).trim();
    
    // Validate Letterboxd username by checking if profile exists
    // Letterboxd doesn't have a public API, so we check if the profile page is accessible
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

      try {
        const response = await fetch(`https://letterboxd.com/${username}/`, {
          method: "GET", // Use GET instead of HEAD as some servers block HEAD requests
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Accept": "text/html"
          },
          redirect: "follow",
          signal: controller.signal
        });

        clearTimeout(timeout);

        // Accept 200 or 301/302 redirects (profile exists)
        if (response.status === 404 || response.status === 410) {
          return NextResponse.json(
            { error: "Letterboxd user not found" },
            { status: 400 }
          );
        }

        // If we got a successful response or redirect, the user exists
        if (response.ok || response.status >= 300 && response.status < 400) {
          return NextResponse.json({
            valid: true,
            letterboxdUsername: username,
            message: "Letterboxd username verified"
          });
        }

        // For other status codes, accept the format but note we couldn't verify
        return NextResponse.json({
          valid: true,
          letterboxdUsername: username,
          warning: "Could not verify with Letterboxd, but format is valid",
          message: "Letterboxd username format accepted"
        });
      } catch (timeoutError: any) {
        clearTimeout(timeout);
        if (timeoutError.name === "AbortError") {
          // Timeout - accept format
          return NextResponse.json({
            valid: true,
            letterboxdUsername: username,
            warning: "Letterboxd verification timed out, but format is valid",
            message: "Letterboxd username format accepted"
          });
        }
        throw timeoutError;
      }
    } catch (fetchError) {
      const errorMsg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      logger.warn("Could not reach Letterboxd for validation", { error: errorMsg });
      // If we can't reach Letterboxd, we'll still accept the username format
      return NextResponse.json({
        valid: true,
        letterboxdUsername: username,
        warning: "Could not verify with Letterboxd, but format is valid",
        message: "Letterboxd username format accepted"
      });
    }
  } catch (error) {
    logger.error("Error validating Letterboxd username", error);
    return NextResponse.json(
      { error: "Failed to validate Letterboxd username" },
      { status: 500 }
    );
  }
}
