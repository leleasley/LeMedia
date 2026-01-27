import { NextRequest, NextResponse } from "next/server";
import {
  createMfaSession,
  createUserSession,
  deleteMfaSessionsForUser,
  getSetting,
  getSettingInt,
  getUserByJellyfinUserId,
  linkUserToJellyfin
} from "@/db";
import { getJellyfinBaseUrl, jellyfinLogin } from "@/lib/jellyfin-admin";
import { createSessionToken } from "@/lib/session";
import { ensureCsrfCookie, getCookieBase, getRequestContext, isSameOriginRequest, sanitizeRelativePath } from "@/lib/proxy";
import { isValidCsrfToken } from "@/lib/csrf";
import { authenticator } from "otplib";
import { checkLockout, checkRateLimit, clearFailures, getClientIp, recordFailure, rateLimitResponse } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit-log";
import { randomUUID } from "crypto";
import { summarizeUserAgent } from "@/lib/device-info";
import { verifyTurnstileToken } from "@/lib/turnstile";

function buildDeviceId(username: string) {
  return Buffer.from(`BOT_lemedia_${username}`).toString("base64");
}

function formatRetry(retryAfterSec: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const usernameInput = (formData.get("username")?.toString().trim() || "");
  const password = formData.get("password")?.toString() || "";
  const csrfToken = formData.get("csrf_token")?.toString() || "";
  const turnstileToken = formData.get("turnstile_token")?.toString() || "";
  const from = sanitizeRelativePath(formData.get("from")?.toString());
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const ip = getClientIp(req);
  const rate = checkRateLimit(`login:jellyfin:${ip}`, { windowMs: 60 * 1000, max: 10 });

  const redirectToLogin = (message: string) => {
    const url = new URL("/login", base);
    url.searchParams.set("error", message);
    const res = NextResponse.redirect(url, { status: 303 });
    const cookieBase = getCookieBase(ctx, true);
    res.cookies.set("lemedia_login_redirect", from, { ...cookieBase, maxAge: 60 * 30 });
    res.cookies.set("lemedia_mfa_token", "", { ...cookieBase, maxAge: 0 });
    res.cookies.set("lemedia_force_login", "", { ...cookieBase, maxAge: 0 });
    return ensureCsrfCookie(req, res, ctx).res;
  };

  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec);
  }

  const lockKey = `login:jellyfin:${(usernameInput || "unknown").toLowerCase()}:${ip}`;
  const lock = checkLockout(lockKey, { windowMs: 15 * 60 * 1000, max: 5, banMs: 15 * 60 * 1000 });
  if (lock.locked) {
    return redirectToLogin(formatRetry(lock.retryAfterSec));
  }

  if (!isSameOriginRequest(req, base)) {
    return redirectToLogin("Invalid login request");
  }

  if (!isValidCsrfToken(req, csrfToken)) {
    return redirectToLogin("Invalid CSRF token");
  }

  const turnstileValid = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileValid) {
    return redirectToLogin("Invalid security challenge. Please try again.");
  }

  if (!usernameInput || !password) {
    return redirectToLogin("Enter a username and password");
  }

  const baseUrl = await getJellyfinBaseUrl();
  if (!baseUrl) {
    return redirectToLogin("Jellyfin is not configured");
  }

  let login;
  try {
    login = await jellyfinLogin({
      baseUrl,
      username: usernameInput,
      password,
      deviceId: buildDeviceId(usernameInput.toLowerCase()),
      clientIp: ip
    });
  } catch {
    const failure = recordFailure(lockKey, { windowMs: 15 * 60 * 1000, max: 5, banMs: 15 * 60 * 1000 });
    if (failure.locked) {
      return redirectToLogin(formatRetry(failure.retryAfterSec));
    }
    return redirectToLogin("Invalid username or password");
  }

  const user = await getUserByJellyfinUserId(login.userId);
  if (!user) {
    return redirectToLogin("No linked account found for this Jellyfin user");
  }

  if (user.banned) {
    return redirectToLogin("Account suspended");
  }

  clearFailures(lockKey);
  await deleteMfaSessionsForUser(user.id);

  await linkUserToJellyfin({
    userId: user.id,
    jellyfinUserId: login.userId,
    jellyfinUsername: login.username,
    jellyfinDeviceId: user.jellyfin_device_id ?? buildDeviceId(user.username),
    jellyfinAuthToken: login.accessToken,
    avatarUrl: user.avatar_url ?? `/avatarproxy/${login.userId}`
  });

  await logAuditEvent({
    action: "user.login",
    actor: user.username,
    metadata: { provider: "jellyfin" },
    ip
  });

  const cookieBase = getCookieBase(ctx, true);
  const rawOtpEnabled = await getSetting("auth.otp_enabled");
  const otpEnabled = rawOtpEnabled === null || rawOtpEnabled === "1" || rawOtpEnabled === "true";

  if (user.mfa_secret && otpEnabled) {
    const mfaSession = await createMfaSession({ userId: user.id, type: "verify", expiresInSeconds: 60 * 5 });
    const res = NextResponse.redirect(new URL("/mfa", base), { status: 303 });
    res.cookies.set("lemedia_mfa_token", mfaSession.id, { ...cookieBase, maxAge: 60 * 5 });
    res.cookies.set("lemedia_login_redirect", from, { ...cookieBase, maxAge: 60 * 30 });
    res.cookies.set("lemedia_force_login", "", { ...cookieBase, maxAge: 0 });
    return ensureCsrfCookie(req, res, ctx).res;
  }

  if (otpEnabled && !user.mfa_secret) {
    const secret = authenticator.generateSecret();
    const setupSession = await createMfaSession({
      userId: user.id,
      type: "setup",
      secret,
      expiresInSeconds: 60 * 15
    });
    const res = NextResponse.redirect(new URL("/mfa_setup", base), { status: 303 });
    res.cookies.set("lemedia_mfa_token", setupSession.id, { ...cookieBase, maxAge: 60 * 15 });
    res.cookies.set("lemedia_login_redirect", from, { ...cookieBase, maxAge: 60 * 30 });
    res.cookies.set("lemedia_force_login", "", { ...cookieBase, maxAge: 0 });
    return ensureCsrfCookie(req, res, ctx).res;
  }

  const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
  const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
  const groups = user.groups.length ? user.groups : ["users"];

  const jti = randomUUID();
  const token = await createSessionToken({ username: user.username, groups, maxAgeSeconds: sessionMaxAge, jti });
  const userAgent = req.headers.get("user-agent");
  const deviceLabel = summarizeUserAgent(userAgent);
  await createUserSession(user.id, jti, new Date(Date.now() + sessionMaxAge * 1000), {
    userAgent,
    deviceLabel,
    ipAddress: ip
  });
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
  return ensureCsrfCookie(req, res, ctx).res;
}
