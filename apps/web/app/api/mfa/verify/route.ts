import { NextRequest, NextResponse } from "next/server";
import { authenticator } from "otplib";
import { getMfaSessionById, deleteMfaSessionById, getUserMfaSecretById, getUserById, getSettingInt, createUserSession } from "@/db";
import { createSessionToken } from "@/lib/session";
import { ensureCsrfCookie, getCookieBase, getRequestContext, sanitizeRelativePath } from "@/lib/proxy";
import { isValidCsrfToken } from "@/lib/csrf";
import { checkRateLimit, checkLockout, clearFailures, getClientIp, recordFailure, rateLimitResponse } from "@/lib/rate-limit";
import { randomUUID } from "crypto";

function redirectToLogin(base: string, message: string) {
  const url = new URL("/login", base);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, { status: 303 });
}

function redirectToMfa(base: string, message: string) {
  const url = new URL("/mfa", base);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url, { status: 303 });
}

function formatRetry(retryAfterSec: number) {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const code = (formData.get("code")?.toString().trim() || "");
  const csrfToken = formData.get("csrf_token")?.toString() || "";
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const ip = getClientIp(req);
  const rate = checkRateLimit(`mfa:${ip}`, { windowMs: 60 * 1000, max: 10 });
  const cookieOptions = getCookieBase(ctx, true);
  const from = sanitizeRelativePath(req.cookies.get("lemedia_login_redirect")?.value);
  const token = req.cookies.get("lemedia_mfa_token")?.value;

  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec);
  }

  const lockKey = `mfa:${token || "unknown"}:${ip}`;
  const lock = checkLockout(lockKey, { windowMs: 10 * 60 * 1000, max: 5, banMs: 10 * 60 * 1000 });
  if (lock.locked) {
    return redirectToMfa(base, formatRetry(lock.retryAfterSec));
  }

  if (!token) {
    return redirectToLogin(base, "Session expired. Please sign in again.");
  }

  if (!isValidCsrfToken(req, csrfToken)) {
    return redirectToLogin(base, "Invalid CSRF token");
  }

  if (!code) {
    return redirectToMfa(base, "Enter the code from your authenticator app");
  }

  const session = await getMfaSessionById(token);
  if (!session || session.type !== "verify") {
    return redirectToLogin(base, "Please sign in again");
  }

  const secret = await getUserMfaSecretById(session.user_id);
  if (!secret) {
    return redirectToLogin(base, "Your account is not configured for MFA");
  }

  if (!authenticator.check(code, secret)) {
    const failure = recordFailure(lockKey, { windowMs: 10 * 60 * 1000, max: 5, banMs: 10 * 60 * 1000 });
    if (failure.locked) {
      return redirectToMfa(base, formatRetry(failure.retryAfterSec));
    }
    return redirectToMfa(base, "Invalid authentication code");
  }

  clearFailures(lockKey);
  const user = await getUserById(session.user_id);
  if (!user) {
    return redirectToLogin(base, "Unable to load your account");
  }

  await deleteMfaSessionById(session.id);

  const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
  const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
  const groups = user.groups.length ? user.groups : ["users"];

  const jti = randomUUID();
  const sessionToken = await createSessionToken({ username: user.username, groups, maxAgeSeconds: sessionMaxAge, jti });
  await createUserSession(user.id, jti, new Date(Date.now() + sessionMaxAge * 1000));
  const url = new URL(from, base);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set("lemedia_session", sessionToken, { ...cookieOptions, maxAge: sessionMaxAge });
  // Clear any previous flash and set success
  res.cookies.set("lemedia_flash", "", { ...cookieOptions, maxAge: 0 });
  res.cookies.set("lemedia_flash_error", "", { ...cookieOptions, maxAge: 0 });
  res.cookies.set("lemedia_flash", "login-success", { ...cookieOptions, maxAge: 120 });
  res.cookies.set("lemedia_user", "", { ...cookieOptions, maxAge: 0 });
  res.cookies.set("lemedia_groups", "", { ...cookieOptions, maxAge: 0 });
  res.cookies.set("lemedia_expires", "", { ...cookieOptions, maxAge: 0 });
  res.cookies.set("lemedia_login_redirect", "", { ...cookieOptions, maxAge: 0 });
  res.cookies.set("lemedia_mfa_token", "", { ...cookieOptions, maxAge: 0 });
  res.cookies.set("lemedia_force_login", "", { ...cookieOptions, maxAge: 0 });
  res.cookies.set("lemedia_session_reset", "", { ...cookieOptions, httpOnly: false, maxAge: 0 });
  return ensureCsrfCookie(req, res, ctx).res;
}
