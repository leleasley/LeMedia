import { NextRequest, NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { setWeeklyDigestPreference } from "@/db";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function htmlResponse(message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>LeMedia</title></head><body style="font-family:Arial,sans-serif;background:#0b1220;color:#e2e8f0;padding:40px;"><div style="max-width:520px;margin:0 auto;background:#111827;border-radius:12px;padding:24px;border:1px solid rgba(255,255,255,0.08);"><h1 style="margin:0 0 12px;font-size:20px;">Email Preferences</h1><p style="margin:0;font-size:14px;color:#cbd5f5;">${message}</p></div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rate = await checkRateLimit(`email-unsubscribe:${ip}`, { windowMs: 60 * 1000, max: 10 });
  if (!rate.ok) {
    return htmlResponse("Too many requests. Please try again in a minute.", 429);
  }

  const token = req.nextUrl.searchParams.get("token");
  if (!token) return htmlResponse("Missing unsubscribe token.", 400);

  let data;
  try {
    data = verifyUnsubscribeToken(token);
  } catch {
    data = null;
  }

  if (!data) return htmlResponse("This unsubscribe link is invalid or has expired.", 400);

  await setWeeklyDigestPreference(data.userId, false);
  return htmlResponse("You have been unsubscribed from weekly digest emails.");
}
