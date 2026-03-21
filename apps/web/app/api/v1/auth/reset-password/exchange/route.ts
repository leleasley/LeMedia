import { NextRequest, NextResponse } from "next/server";
import { exchangePasswordResetToken } from "@/db";
import { resolvePublicBaseUrl } from "@/lib/server-utils";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

/**
 * GET /api/v1/auth/reset-password/exchange?token=<raw-token>
 *
 * Validates the one-time reset token, marks it as viewed (preventing
 * reuse of the link), stores the raw token in a short-lived HttpOnly
 * cookie, then redirects the browser to /reset-password — a clean URL
 * with no token visible in the address bar or page source.
 *
 * If the token is invalid, expired, or has already been viewed,
 * the redirect happens without setting the cookie; the page then
 * shows an "expired or already used" message.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const ip = getClientIp(req);
  const destination = new URL("/reset-password", resolvePublicBaseUrl(req));
  const clearResetCookie = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  };

  if (!token) {
    const res = NextResponse.redirect(destination, { status: 303 });
    res.cookies.set("rp_token", "", clearResetCookie);
    return res;
  }

  const username = await exchangePasswordResetToken(token);
  const res = NextResponse.redirect(destination, { status: 303 });

  if (username) {
    res.cookies.set("rp_token", token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 15 * 60, // 15 minutes — matches token lifetime
      secure: process.env.NODE_ENV === "production",
    });
    await logAuditEvent({
      action: "user.password_reset_link_opened",
      actor: username,
      ip,
    });
  } else {
    res.cookies.set("rp_token", "", clearResetCookie);
  }

  return res;
}
