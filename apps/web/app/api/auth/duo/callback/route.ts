import { NextRequest, NextResponse } from "next/server";
import { Client } from "@duosecurity/duo_universal";
import {
  createOidcUser,
  getActiveOidcProvider,
  getOidcProviderById,
  getSettingInt,
  getUserByEmail,
  getUserByOidcSub,
  getUserByUsername,
  getUserByUsernameInsensitive,
  updateUserOidcLink,
  createUserSession
} from "@/db";
import { createSessionToken } from "@/lib/session";
import { ensureCsrfCookie, getCookieBase, getRequestContext, sanitizeRelativePath } from "@/lib/proxy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit-log";
import { randomUUID } from "crypto";
import { summarizeUserAgent } from "@/lib/device-info";
import { normalizeGroupList } from "@/lib/groups";

function redirectToLogin(
  base: string,
  message: string,
  cookieBase: { httpOnly: boolean; sameSite: "none" | "lax"; secure: boolean; path: string; domain?: string }
) {
  const url = new URL("/login", base);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set("lemedia_flash_error", message, { ...cookieBase, maxAge: 60 });
  res.cookies.set("lemedia_duo_state", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_duo_username", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_duo_provider", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_login_redirect", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_sso_popup", "", { ...cookieBase, maxAge: 0 });
  return res;
}

export async function GET(req: NextRequest) {
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const cookieBase = getCookieBase(ctx, true);
  const ip = getClientIp(req);
  const rate = checkRateLimit(`duo_callback:${ip}`, { windowMs: 60 * 1000, max: 30 });
  if (!rate.ok) {
    return ensureCsrfCookie(req, redirectToLogin(base, "Too many SSO attempts. Please try again shortly.", cookieBase), ctx).res;
  }

  const error = req.nextUrl.searchParams.get("error");
  const errorDesc = req.nextUrl.searchParams.get("error_description");
  if (error) {
    return ensureCsrfCookie(req, redirectToLogin(base, errorDesc || "SSO authentication failed", cookieBase), ctx).res;
  }

  const code = req.nextUrl.searchParams.get("duo_code") ?? req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const storedState = req.cookies.get("lemedia_duo_state")?.value ?? "";
  const storedUsername = req.cookies.get("lemedia_duo_username")?.value ?? "";
  const storedProviderId = req.cookies.get("lemedia_duo_provider")?.value ?? "";
  const from = sanitizeRelativePath(req.cookies.get("lemedia_login_redirect")?.value);
  const popupRequested = req.cookies.get("lemedia_sso_popup")?.value === "1";

  if (!code || !state || !storedState || state !== storedState) {
    return ensureCsrfCookie(req, redirectToLogin(base, "SSO session expired. Please try again.", cookieBase), ctx).res;
  }

  let config = storedProviderId ? await getOidcProviderById(storedProviderId) : null;
  if (!config) {
    config = await getActiveOidcProvider();
  }

  const isDuoProvider = config?.providerType === "duo_websdk" || /duo/i.test(config?.name ?? "") || !!config?.duoApiHostname;
  if (!config || !isDuoProvider || !config.clientId || !config.clientSecret || !config.duoApiHostname) {
    return ensureCsrfCookie(req, redirectToLogin(base, "Duo Web SDK is not configured", cookieBase), ctx).res;
  }

  const username = storedUsername || "";
  if (!username) {
    return ensureCsrfCookie(req, redirectToLogin(base, "Duo username missing. Please try again.", cookieBase), ctx).res;
  }

  const redirectUrl = config.redirectUri || `${base}/api/auth/duo/callback`;
  const client = new Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    apiHost: config.duoApiHostname,
    redirectUrl
  });

  let token;
  try {
    token = await client.exchangeAuthorizationCodeFor2FAResult(code, username);
  } catch {
    return ensureCsrfCookie(req, redirectToLogin(base, "Unable to complete Duo login", cookieBase), ctx).res;
  }

  if (!token?.auth_result || token.auth_result.result !== "allow") {
    return ensureCsrfCookie(req, redirectToLogin(base, "Duo authentication was denied", cookieBase), ctx).res;
  }

  const sub = token.sub ? String(token.sub) : "";
  if (!sub) {
    return ensureCsrfCookie(req, redirectToLogin(base, "Duo response missing subject", cookieBase), ctx).res;
  }

  const emailFromToken = token.auth_context?.email ? String(token.auth_context.email).toLowerCase() : "";
  const emailFromInput = storedUsername.includes("@") ? storedUsername.toLowerCase() : "";
  const email = emailFromToken || emailFromInput;
  const rawUsername = token.preferred_username || token.auth_context?.user?.name || username;
  const normalizedUsername = rawUsername ? String(rawUsername).toLowerCase() : "";

  let user = await getUserByOidcSub(sub);
  let matchedByEmail = false;
  let matchedByUsername = false;
  if (!user && config.matchByEmail && email) {
    user = await getUserByEmail(email);
    matchedByEmail = !!user;
  }
  if (!user && config.matchByUsername && normalizedUsername) {
    user = await getUserByUsernameInsensitive(normalizedUsername);
    matchedByUsername = !!user;
  }
  if (!user && config.matchByUsername && storedUsername) {
    user = await getUserByUsernameInsensitive(storedUsername);
    matchedByUsername = !!user;
  }

  if (user?.oidc_sub && user.oidc_sub !== sub) {
    if (matchedByEmail || matchedByUsername) {
      await updateUserOidcLink({
        userId: user.id,
        oidcSub: sub,
        email: matchedByEmail && email ? email : undefined
      });
      user = { ...user, oidc_sub: sub, email: matchedByEmail && email ? email : user.email };
    } else {
      return ensureCsrfCookie(req, redirectToLogin(base, "SSO account is already linked to a different user", cookieBase), ctx).res;
    }
  }

  if (!user) {
    if (!config.allowAutoCreate) {
      return ensureCsrfCookie(req, redirectToLogin(base, "No local account found for this SSO user", cookieBase), ctx).res;
    }
    const derivedUsername = normalizedUsername || (email ? email.split("@")[0] : "");
    if (!derivedUsername) {
      return ensureCsrfCookie(req, redirectToLogin(base, "SSO account is missing a username", cookieBase), ctx).res;
    }
    try {
      user = await createOidcUser({
        username: derivedUsername,
        email: email || null,
        groups: ["users"],
        oidcSub: sub
      });
    } catch {
      return ensureCsrfCookie(req, redirectToLogin(base, "Unable to create local account", cookieBase), ctx).res;
    }
  } else {
    const shouldUpdateEmail = !!email && !user.email;
    if (!user.oidc_sub || shouldUpdateEmail) {
      await updateUserOidcLink({
        userId: user.id,
        oidcSub: user.oidc_sub || sub,
        email: shouldUpdateEmail ? email : undefined
      });
      user = {
        ...user,
        oidc_sub: user.oidc_sub || sub,
        email: shouldUpdateEmail ? email ?? null : user.email
      };
    }
  }

  if (user.banned) {
    return ensureCsrfCookie(req, redirectToLogin(base, "Account suspended", cookieBase), ctx).res;
  }

  const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
  const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
  const sessionGroups = normalizeGroupList(user.groups);

  await logAuditEvent({
    action: "user.login",
    actor: user.username,
    ip: ip,
    metadata: { method: "duo_websdk", provider: config.name ?? "Duo" }
  });

  const jti = randomUUID();
  const tokenValue = await createSessionToken({ username: user.username, groups: sessionGroups, maxAgeSeconds: sessionMaxAge, jti });
  const userAgent = req.headers.get("user-agent");
  const deviceLabel = summarizeUserAgent(userAgent);
  await createUserSession(user.id, jti, new Date(Date.now() + sessionMaxAge * 1000), {
    userAgent,
    deviceLabel,
    ipAddress: ip
  });
  const redirectTarget = popupRequested
    ? (() => {
        const url = new URL("/auth/popup-complete", base);
        url.searchParams.set("from", from || "/");
        return url;
      })()
    : new URL(from, base);
  const res = NextResponse.redirect(redirectTarget);
  res.cookies.set("lemedia_session", tokenValue, { ...cookieBase, maxAge: sessionMaxAge });
  res.cookies.set("lemedia_flash", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_flash_error", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_flash", "login-success", { ...cookieBase, maxAge: 120 });
  res.cookies.set("lemedia_user", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_groups", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_expires", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_login_redirect", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_duo_state", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_duo_username", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_duo_provider", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_sso_popup", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_force_login", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_mfa_token", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_session_reset", "", { ...cookieBase, httpOnly: false, maxAge: 0 });
  return ensureCsrfCookie(req, res, ctx).res;
}
