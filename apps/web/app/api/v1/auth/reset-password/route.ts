import { NextRequest, NextResponse } from "next/server";
import { consumePasswordResetToken, updateUserPasswordById, addUserPasswordHistory, revokeAllSessionsForUser, getUserWithHashById } from "@/db";
import { hashPassword } from "@/lib/auth-utils";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isValidCsrfToken } from "@/lib/csrf";
import { isSameOriginRequest, getRequestContext } from "@/lib/proxy";
import { logAuditEvent } from "@/lib/audit-log";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

export async function POST(req: NextRequest) {
  const ctx = getRequestContext(req);
  const ip = getClientIp(req);

  // Rate limit: 10 attempts per 15 minutes per IP
  const rate = await checkRateLimit(`reset-password:${ip}`, { windowMs: 15 * 60 * 1000, max: 10 });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  if (!isSameOriginRequest(req, ctx.base)) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 403 });
  }

  // Token is stored in an HttpOnly cookie set by the exchange endpoint — never in the URL or request body.
  const token = req.cookies.get("rp_token")?.value ?? "";
  if (!token) {
    return NextResponse.json({ ok: false, error: "Reset session missing. Please use the link from your email." }, { status: 400 });
  }

  let password: string;
  let csrfToken: string;

  try {
    const body = await req.json();
    password = String(body.password ?? "");
    csrfToken = String(body.csrf_token ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!isValidCsrfToken(req, csrfToken)) {
    return NextResponse.json({ ok: false, error: "Invalid CSRF token." }, { status: 403 });
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 }
    );
  }

  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "Password is too long." },
      { status: 400 }
    );
  }

  // Atomically consume the token — returns userId or null if invalid/expired/used.
  const userId = await consumePasswordResetToken(token);
  if (!userId) {
    await logAuditEvent({
      action: "user.password_reset_failed",
      actor: "unknown",
      ip,
      metadata: { reason: "invalid_or_expired_token" },
    });
    return NextResponse.json(
      { ok: false, error: "This reset link is invalid or has expired. Please request a new one." },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password);
  await updateUserPasswordById(userId, passwordHash);
  await addUserPasswordHistory(userId, passwordHash);

  // Revoke all existing sessions so the account is cleanly re-authenticated.
  await revokeAllSessionsForUser(userId);

  const user = await getUserWithHashById(userId);
  const actor = user?.username ?? String(userId);

  await logAuditEvent({
    action: "user.password_reset",
    actor,
    ip,
  });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("rp_token", "", { maxAge: 0, path: "/", httpOnly: true, sameSite: "lax" });
  return res;
}
