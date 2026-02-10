import { NextRequest, NextResponse } from "next/server";
import { getActiveOidcProvider, getSetting, revokeSessionByJti } from "@/db";
import { getCookieBase, getRequestContext, isSameOriginRequest } from "@/lib/proxy";
import { verifySessionToken } from "@/lib/session";
import { logger } from "@/lib/logger";

function sanitizeFrom(base: string, raw: string | null): string {
  if (!raw) return "/";
  try {
    if (raw.startsWith("http")) {
      const u = new URL(raw);
      return u.pathname + u.search;
    }
    const u = new URL(raw, base);
    return u.pathname + u.search;
  } catch {
    return "/";
  }
}

export async function GET(req: NextRequest) {
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const oidcConfig = await getActiveOidcProvider();
  const rawSession = req.cookies.get("lemedia_session")?.value;
  if (rawSession) {
    try {
      const session = await verifySessionToken(rawSession);
      if (session?.jti) {
        await revokeSessionByJti(session.jti);
      }
    } catch {
      // ignore revoke errors during logout
    }
  }
  
  // Check for Authelia session - if present, we need to logout from Authelia too
  const autheliaSession = req.cookies.get("authelia_session")?.value;
  const autheliaLogoutUrl = await getSetting("authelia_logout_url");

  // Debug logging
  logger.debug("[LOGOUT] Context", { base: ctx.base, secure: ctx.secure, cookieDomain: ctx.cookieDomain, sameSite: ctx.sameSite });
  logger.debug("[LOGOUT] Incoming cookies", { cookies: req.cookies.getAll().map(c => c.name) });
  logger.debug("[LOGOUT] Authelia session present", { present: !!autheliaSession });
  logger.debug("[LOGOUT] Authelia logout URL configured", { url: autheliaLogoutUrl || "(none)" });

  const fromPath = isSameOriginRequest(req, base) ? sanitizeFrom(base, req.headers.get("referer")) : "/";
  let redirectTarget = new URL("/login", base);
  
  // Priority 1: If Authelia is being used and logout URL is configured, redirect there
  if (autheliaSession && autheliaLogoutUrl) {
    try {
      redirectTarget = new URL(autheliaLogoutUrl);
      // Set the redirect back to our login page after Authelia logout
      redirectTarget.searchParams.set("rd", new URL("/login", base).toString());
    } catch {
      // fallback to local login
    }
  }
  // Priority 2: OIDC logout if configured
  else if (oidcConfig?.logoutUrl) {
    try {
      const logoutUrl = new URL(oidcConfig.logoutUrl);
      logoutUrl.searchParams.set("post_logout_redirect_uri", redirectTarget.toString());
      if (oidcConfig.clientId) {
        logoutUrl.searchParams.set("client_id", oidcConfig.clientId);
      }
      redirectTarget = logoutUrl;
    } catch {
      // fallback to local logout redirect
    }
  }
  
  const res = NextResponse.redirect(redirectTarget);
  const cookieBase = getCookieBase(ctx, true);
  
  // Build cookie deletion string - must match EXACTLY how cookies were set during login
  // IMPORTANT: If domain was not set during login, we must NOT include Domain attribute
  const buildDeleteCookie = (name: string, httpOnly: boolean, includeDomain: boolean) => {
    const parts = [
      `${name}=`,
      "Path=/",
      "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
      "Max-Age=0",
    ];
    // Only include domain if it was set during login AND we want to include it
    if (includeDomain && ctx.cookieDomain) {
      parts.push(`Domain=${ctx.cookieDomain}`);
    }
    if (ctx.secure) parts.push("Secure");
    parts.push("SameSite=Lax");
    if (httpOnly) parts.push("HttpOnly");
    return parts.join("; ");
  };

  // Cookies to clear - these are HttpOnly
  const httpOnlyCookies = [
    "lemedia_session",
    "lemedia_user",
    "lemedia_groups",
    "lemedia_mfa_token",
    "lemedia_oidc_state",
    "lemedia_oidc_nonce",
    "lemedia_oidc_provider",
    "lemedia_duo_state",
    "lemedia_duo_username",
    "lemedia_duo_provider",
    "lemedia_oidc_id_token",
    "lemedia_oidc_access_token",
    "lemedia_expires",
    "authelia_session", // Try to clear Authelia session too (may not work if different domain)
  ];

  // Cookies that are NOT HttpOnly
  const publicCookies = [
    "lemedia_csrf",
  ];

  // Clear all cookies
  // Strategy: Always clear without domain first (host-only), then with domain if we have one
  // This ensures we clear cookies regardless of how they were originally set
  for (const name of httpOnlyCookies) {
    // Clear host-only version (no domain attribute)
    res.headers.append("Set-Cookie", buildDeleteCookie(name, true, false));
    // Also clear with domain if one is configured
    if (ctx.cookieDomain) {
      res.headers.append("Set-Cookie", buildDeleteCookie(name, true, true));
    }
  }

  for (const name of publicCookies) {
    res.headers.append("Set-Cookie", buildDeleteCookie(name, false, false));
    if (ctx.cookieDomain) {
      res.headers.append("Set-Cookie", buildDeleteCookie(name, false, true));
    }
  }

  // Set new cookies for flash message and redirect
  const buildSetCookie = (name: string, value: string, maxAge: number, httpOnly: boolean) => {
    const parts = [
      `${name}=${encodeURIComponent(value)}`,
      "Path=/",
      `Max-Age=${maxAge}`,
    ];
    // Match how login sets cookies - only include domain if cookieDomain is set
    if (ctx.cookieDomain) {
      parts.push(`Domain=${ctx.cookieDomain}`);
    }
    if (ctx.secure) parts.push("Secure");
    parts.push("SameSite=Lax");
    if (httpOnly) parts.push("HttpOnly");
    return parts.join("; ");
  };

  // Use raw headers for setting new cookies too (must not mix with res.cookies.set)
  res.headers.append("Set-Cookie", buildSetCookie("lemedia_flash", "logged-out", 120, true));
  res.headers.append("Set-Cookie", buildSetCookie("lemedia_login_redirect", fromPath || "/", 60 * 30, true));
  res.headers.append("Set-Cookie", buildSetCookie("lemedia_force_login", "1", 60 * 30, true));
  
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");

  logger.debug("[LOGOUT] Set-Cookie headers being sent", { cookies: res.headers.getSetCookie() });
  
  return res;
}
