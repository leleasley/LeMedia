import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getCalendarFeedToken, rotateCalendarFeedToken } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

function resolvePublicBaseUrl(origin: string) {
  return process.env.APP_BASE_URL?.replace(/\/+$/, "") || origin;
}

function buildFeedUrls(origin: string, token: string) {
  const baseUrl = resolvePublicBaseUrl(origin);
  const httpsUrl = `${baseUrl}/api/calendar/export?token=${token}`;
  const webcalUrl = httpsUrl.replace(/^https?:\/\//i, "webcal://");
  return { httpsUrl, webcalUrl };
}

/**
 * GET /api/calendar/feed - Returns the user's calendar feed URLs
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const token = await getCalendarFeedToken(user.id);
    const { httpsUrl, webcalUrl } = buildFeedUrls(req.nextUrl.origin, token);
    return NextResponse.json({ token, httpsUrl, webcalUrl });
  } catch (error) {
    logger.error("[Calendar Feed] GET Error", error);
    return NextResponse.json({ error: "Failed to fetch calendar feed" }, { status: 500 });
  }
}

/**
 * POST /api/calendar/feed - Rotates the calendar feed token
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();

    const csrfError = requireCsrf(req);
    if (csrfError) return csrfError;

    const token = await rotateCalendarFeedToken(user.id);
    const { httpsUrl, webcalUrl } = buildFeedUrls(req.nextUrl.origin, token);
    return NextResponse.json({ token, httpsUrl, webcalUrl });
  } catch (error) {
    logger.error("[Calendar Feed] POST Error", error);
    return NextResponse.json({ error: "Failed to rotate calendar feed" }, { status: 500 });
  }
}
