import { NextRequest, NextResponse } from "next/server";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { resolveBase } from "@/lib/server-utils";

// GET /api/telegram/login-redirect
// Sets the post-login redirect cookie and sends the user to /login.
// Uses APP_BASE_URL so it works correctly behind a reverse proxy.
export async function GET(req: NextRequest) {
  const ctx = getRequestContext(req);
  const base = resolveBase(req);
  const res = NextResponse.redirect(new URL("/login", base));
  res.cookies.set("lemedia_login_redirect", "/telegram-link", {
    ...getCookieBase(ctx, true),
    maxAge: 60 * 30
  });
  return res;
}
