import { NextRequest, NextResponse } from "next/server";
import { getUserWithHash, createMfaSession, deleteMfaSessionsForUser, getSetting, getSettingInt, createUserSession } from "@/db";
import { verifyPassword } from "@/lib/auth-utils";
import { createSessionToken } from "@/lib/session";
import { ensureCsrfCookie, getCookieBase, getRequestContext, isSameOriginRequest, sanitizeRelativePath } from "@/lib/proxy";
import { isValidCsrfToken } from "@/lib/csrf";
import { generateSecret } from "otplib";
import { checkRateLimit, checkLockout, clearFailures, getClientIp, recordFailure, rateLimitResponse } from "@/lib/rate-limit";
import { logAuditEvent } from "@/lib/audit-log";
import { randomUUID } from "crypto";
import { summarizeUserAgent } from "@/lib/device-info";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { normalizeGroupList } from "@/lib/groups";

function formatRetry(retryAfterSec: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const usernameInput = (formData.get("username")?.toString().trim() || "").toLowerCase();
  const password = formData.get("password")?.toString() || "";
  const csrfToken = formData.get("csrf_token")?.toString() || "";
  const turnstileToken = formData.get("turnstile_token")?.toString() || "";
  const from = sanitizeRelativePath(formData.get("from")?.toString());
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");
  const deviceLabel = summarizeUserAgent(userAgent);
  const rate = await checkRateLimit(`login:${ip}`, { windowMs: 60 * 1000, max: 10 });

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

  const lockKey = `login:${usernameInput || "unknown"}:${ip}`;
  const lock = await checkLockout(lockKey, { windowMs: 15 * 60 * 1000, max: 5, banMs: 15 * 60 * 1000 });
  if (lock.locked) {
    return redirectToLogin(formatRetry(lock.retryAfterSec));
  }

  if (!isSameOriginRequest(req, base)) {
    return redirectToLogin("Invalid login request");
  }

  if (!isValidCsrfToken(req, csrfToken)) {
    return redirectToLogin("Invalid CSRF token");
  }

  // Verify Turnstile token if enabled
  const turnstileValid = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileValid) {
    return redirectToLogin("Invalid security challenge. Please try again.");
  }

  if (!usernameInput || !password) {
    return redirectToLogin("Enter a username and password");
  }

  const user = await getUserWithHash(usernameInput);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    const failure = await recordFailure(lockKey, { windowMs: 15 * 60 * 1000, max: 5, banMs: 15 * 60 * 1000 });
    if (failure.locked) {
      return redirectToLogin(formatRetry(failure.retryAfterSec));
    }
    return redirectToLogin("Invalid username or password");
  }

  if (user.banned) {
    return redirectToLogin("Account suspended");
  }

  await clearFailures(lockKey);
  await deleteMfaSessionsForUser(user.id);
  
  // Log successful login
  await logAuditEvent({
    action: "user.login",
    actor: user.username,
    ip: ip,
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
    const secret = generateSecret();
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

  // If OTP is disabled or user passed checks (but here if OTP disabled, we just log them in)
  const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
  const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
  const groups = normalizeGroupList(user.groups);

  const jti = randomUUID();
  const token = await createSessionToken({ username: user.username, groups, maxAgeSeconds: sessionMaxAge, jti });
  await createUserSession(user.id, jti, new Date(Date.now() + sessionMaxAge * 1000), {
    userAgent,
    deviceLabel,
    ipAddress: ip
  });
  const res = NextResponse.redirect(new URL(from || "/", base), { status: 303 });
  res.cookies.set("lemedia_session", token, { ...cookieBase, maxAge: sessionMaxAge });
    // Clear any old flash cookies first, then set the new one
    res.cookies.set("lemedia_flash", "", { ...cookieBase, maxAge: 0 });
    res.cookies.set("lemedia_flash_error", "", { ...cookieBase, maxAge: 0 });
    // Now set the new flash message
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
