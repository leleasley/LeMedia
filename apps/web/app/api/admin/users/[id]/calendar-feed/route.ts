import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getCalendarFeedToken, rotateCalendarFeedToken } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

function buildFeedUrls(origin: string, token: string) {
  const baseUrl = (process.env.APP_BASE_URL || origin).replace(/\/+$/, "");
  const httpsUrl = `${baseUrl}/api/calendar/export?token=${token}`;
  const webcalUrl = httpsUrl.replace(/^https?:\/\//i, "webcal://");
  return { httpsUrl, webcalUrl };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getUser();
  if (!currentUser?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const token = await getCalendarFeedToken(userId);
  const urls = buildFeedUrls(req.nextUrl.origin, token);
  return NextResponse.json({ token, ...urls });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getUser();
  if (!currentUser?.isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  const token = await rotateCalendarFeedToken(userId);
  const urls = buildFeedUrls(req.nextUrl.origin, token);

  await logAuditEvent({
    action: "calendar.feed_rotated",
    actor: currentUser.username,
    target: String(userId),
    ip: getClientIp(req),
  });

  return NextResponse.json({ token, ...urls });
}
