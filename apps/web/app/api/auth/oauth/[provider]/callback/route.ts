import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import {
  createUserSession,
  getSettingInt,
  getUserByOAuthAccount,
  getUserWithHash,
  upsertUserOAuthAccount
} from "@/db";
import { logAuditEvent } from "@/lib/audit-log";
import { summarizeUserAgent } from "@/lib/device-info";
import {
  exchangeOAuthCode,
  fetchOAuthIdentity,
  getOAuthCallbackPath,
  getOAuthConfig,
  isOAuthProvider,
  type OAuthProvider
} from "@/lib/oauth-providers";
import { getCookieBase, getRequestContext, sanitizeRelativePath } from "@/lib/proxy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { createSessionToken } from "@/lib/session";
import { normalizeGroupList } from "@/lib/groups";

function clearOauthCookies(res: NextResponse, cookieBase: ReturnType<typeof getCookieBase>) {
  res.cookies.set("lemedia_oauth_state", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oauth_verifier", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oauth_provider", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oauth_mode", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oauth_link_user", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oauth_link_return", "", { ...cookieBase, maxAge: 0 });
}

function loginError(base: string, cookieBase: ReturnType<typeof getCookieBase>, message: string) {
  const url = new URL("/login", base);
  url.searchParams.set("error", message);
  const res = NextResponse.redirect(url, { status: 303 });
  clearOauthCookies(res, cookieBase);
  return res;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await context.params;
  if (!isOAuthProvider(rawProvider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider" }, { status: 404 });
  }
  const provider: OAuthProvider = rawProvider;

  const ctx = getRequestContext(req);
  const base = ctx.base;
  const cookieBase = getCookieBase(ctx, true);
  const ip = getClientIp(req);

  const rate = await checkRateLimit(`oauth:callback:${provider}:${ip}`, { windowMs: 60 * 1000, max: 30 });
  if (!rate.ok) {
    return loginError(base, cookieBase, "Too many sign-in attempts. Please try again shortly.");
  }

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const cookieState = req.cookies.get("lemedia_oauth_state")?.value ?? "";
  const cookieVerifier = req.cookies.get("lemedia_oauth_verifier")?.value ?? "";
  const cookieProvider = req.cookies.get("lemedia_oauth_provider")?.value ?? "";
  const mode = req.cookies.get("lemedia_oauth_mode")?.value ?? "login";

  if (!code || !state || !cookieState || state !== cookieState || cookieProvider !== provider) {
    return loginError(base, cookieBase, "OAuth session expired. Please try again.");
  }

  if (!getOAuthConfig(provider)) {
    return loginError(base, cookieBase, `${provider === "google" ? "Google" : "GitHub"} sign-in is not configured`);
  }

  let identity;
  try {
    const redirectUri = `${base}${getOAuthCallbackPath(provider)}`;
    const token = await exchangeOAuthCode({ provider, code, redirectUri, codeVerifier: cookieVerifier });
    identity = await fetchOAuthIdentity(provider, token.accessToken);
  } catch {
    return loginError(base, cookieBase, "Unable to complete provider sign-in");
  }

  if (mode === "link") {
    const appUser = await getUser().catch(() => null);
    if (!appUser) {
      return loginError(base, cookieBase, "Your session expired. Sign in again to link accounts.");
    }

    const dbUser = await getUserWithHash(appUser.username);
    if (!dbUser) {
      return loginError(base, cookieBase, "User not found");
    }

    const linkUserCookie = req.cookies.get("lemedia_oauth_link_user")?.value ?? "";
    if (!linkUserCookie || Number(linkUserCookie) !== dbUser.id) {
      return loginError(base, cookieBase, "Invalid link session. Try again from Linked Accounts.");
    }

    const existingOwner = await getUserByOAuthAccount(provider, identity.providerUserId);
    if (existingOwner && existingOwner.id !== dbUser.id) {
      return loginError(base, cookieBase, "That provider account is already linked to another user.");
    }

    await upsertUserOAuthAccount({
      userId: dbUser.id,
      provider,
      providerUserId: identity.providerUserId,
      providerEmail: identity.email,
      providerLogin: identity.login
    });

    await logAuditEvent({
      action: "user.updated",
      actor: dbUser.username,
      metadata: { oauthProvider: provider, oauthAction: "linked" },
      ip
    });

    const returnTo = sanitizeRelativePath(req.cookies.get("lemedia_oauth_link_return")?.value) || "/settings/profile/linked";
    const url = new URL(returnTo, base);
    url.searchParams.set("success", `${provider === "google" ? "Google" : "GitHub"} account linked`);
    const res = NextResponse.redirect(url, { status: 303 });
    clearOauthCookies(res, cookieBase);
    return res;
  }

  const linkedUser = await getUserByOAuthAccount(provider, identity.providerUserId);
  if (!linkedUser) {
    return loginError(base, cookieBase, `This ${provider === "google" ? "Google" : "GitHub"} account is not linked. Sign in with password and link it from Profile > Linked Accounts.`);
  }

  if (linkedUser.banned) {
    return loginError(base, cookieBase, "Account suspended");
  }

  const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
  const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
  const groups = normalizeGroupList(linkedUser.groups);

  await logAuditEvent({
    action: "user.login",
    actor: linkedUser.username,
    ip,
    metadata: { method: provider }
  });

  const jti = randomUUID();
  const token = await createSessionToken({ username: linkedUser.username, groups, maxAgeSeconds: sessionMaxAge, jti });
  const userAgent = req.headers.get("user-agent");
  const deviceLabel = summarizeUserAgent(userAgent);
  await createUserSession(linkedUser.id, jti, new Date(Date.now() + sessionMaxAge * 1000), {
    userAgent,
    deviceLabel,
    ipAddress: ip
  });

  const from = sanitizeRelativePath(req.cookies.get("lemedia_login_redirect")?.value);
  const res = NextResponse.redirect(new URL(from || "/", base), { status: 303 });
  res.cookies.set("lemedia_session", token, { ...cookieBase, maxAge: sessionMaxAge });
  res.cookies.set("lemedia_flash", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_flash_error", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_flash", "login-success", { ...cookieBase, maxAge: 120 });
  res.cookies.set("lemedia_user", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_groups", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_expires", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_login_redirect", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_mfa_token", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_force_login", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_session_reset", "", { ...cookieBase, httpOnly: false, maxAge: 0 });
  clearOauthCookies(res, cookieBase);
  return res;
}
