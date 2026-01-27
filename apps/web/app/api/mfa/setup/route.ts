import { NextRequest, NextResponse } from "next/server";
import { authenticator } from "otplib";
import { getMfaSessionById, deleteMfaSessionById, setUserMfaSecretById } from "@/db";
import { ensureCsrfCookie, getCookieBase, getRequestContext } from "@/lib/proxy";
import { isValidCsrfToken } from "@/lib/csrf";
import { checkRateLimit, checkLockout, clearFailures, getClientIp, recordFailure, rateLimitResponse } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const code = (formData.get("code")?.toString().trim() || "");
  const csrfToken = formData.get("csrf_token")?.toString() || "";
  const turnstileToken = formData.get("turnstile_token")?.toString() || "";
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const ip = getClientIp(req);
  const rate = checkRateLimit(`mfa_setup:${ip}`, { windowMs: 60 * 1000, max: 10 });
  const cookieOptions = getCookieBase(ctx, true);
  const token = req.cookies.get("lemedia_mfa_token")?.value;

  if (!rate.ok) {
    return rateLimitResponse(rate.retryAfterSec);
  }

  const lockKey = `mfa_setup:${token || "unknown"}:${ip}`;
  const lock = checkLockout(lockKey, { windowMs: 10 * 60 * 1000, max: 5, banMs: 10 * 60 * 1000 });
  if (lock.locked) {
    return redirectToSetup(formatRetry(lock.retryAfterSec));
  }

  if (!token) {
    return redirectToLogin();
  }

  if (!isValidCsrfToken(req, csrfToken)) {
    return redirectToLogin();
  }

  // Verify Turnstile token if enabled
  const turnstileValid = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileValid) {
    return redirectToSetup("Invalid security challenge. Please try again.");
  }

  const session = await getMfaSessionById(token);
  if (!session || session.type !== "setup" || !session.secret) {
    return redirectToLogin();
  }

  if (!code) {
    return redirectToSetup("Enter the verification code after scanning the QR code");
  }

  if (!authenticator.check(code, session.secret)) {
    const failure = recordFailure(lockKey, { windowMs: 10 * 60 * 1000, max: 5, banMs: 10 * 60 * 1000 });
    if (failure.locked) {
      return redirectToSetup(formatRetry(failure.retryAfterSec));
    }
    return redirectToSetup("Invalid verification code");
  }

  clearFailures(lockKey);
  await setUserMfaSecretById(session.user_id, session.secret);
  await deleteMfaSessionById(session.id);

  const res = NextResponse.redirect(new URL("/login", base), { status: 303 });
  res.cookies.set("lemedia_flash", "MFA enabled. Please sign in with your authenticator app.", {
    ...cookieOptions,
    maxAge: 120
  });
  res.cookies.set("lemedia_flash_error", "", { ...cookieOptions, maxAge: 0 });
  res.cookies.set("lemedia_mfa_token", "", { ...cookieOptions, maxAge: 0 });
  return ensureCsrfCookie(req, res, ctx).res;

  function redirectToLogin() {
    const response = NextResponse.redirect(new URL("/login", base), { status: 303 });
    response.cookies.set("lemedia_flash_error", "Session expired. Please sign in again.", { ...cookieOptions, maxAge: 60 });
    response.cookies.set("lemedia_mfa_token", "", { ...cookieOptions, maxAge: 0 });
    return ensureCsrfCookie(req, response, ctx).res;
  }

  function redirectToSetup(message: string) {
    const response = NextResponse.redirect(new URL("/mfa_setup", base), { status: 303 });
    response.cookies.set("lemedia_flash_error", message, { ...cookieOptions, maxAge: 60 });
    return ensureCsrfCookie(req, response, ctx).res;
  }

  function formatRetry(retryAfterSec: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
    return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }
}
