import { NextRequest, NextResponse } from "next/server";
import { getUserByEmail, createPasswordResetToken } from "@/db";
import { sendEmail } from "@/notifications/email";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isValidCsrfToken } from "@/lib/csrf";
import { isSameOriginRequest, getRequestContext } from "@/lib/proxy";
import { logAuditEvent } from "@/lib/audit-log";
import { randomInt } from "crypto";

// Generic response for every outcome so that callers cannot determine
// whether an email address exists in the system.
const OK_RESPONSE = NextResponse.json({
  ok: true,
  message: "If that email address is registered, a reset link will be sent shortly.",
});

/**
 * Sleeps for a random duration between minMs and maxMs (inclusive).
 * Applied to the "user not found" path so both code paths take a
 * similar, unpredictable amount of time — preventing timing-based
 * user-enumeration attacks.
 */
function randomDelay(minMs = 200, maxMs = 600): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, randomInt(minMs, maxMs + 1)));
}

export async function POST(req: NextRequest) {
  const ctx = getRequestContext(req);
  const ip = getClientIp(req);

  // Rate limit: 5 requests per 10 minutes per IP
  const rate = await checkRateLimit(`forgot-password:${ip}`, { windowMs: 10 * 60 * 1000, max: 5 });
  if (!rate.ok) {
    return NextResponse.json(
      { ok: false, error: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  if (!isSameOriginRequest(req, ctx.base)) {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 403 });
  }

  let email: string;
  let csrfToken: string;

  try {
    const body = await req.json();
    email = String(body.email ?? "").trim().toLowerCase();
    csrfToken = String(body.csrf_token ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  if (!isValidCsrfToken(req, csrfToken)) {
    return NextResponse.json({ ok: false, error: "Invalid CSRF token." }, { status: 403 });
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  }

  const user = await getUserByEmail(email);

  if (!user || !user.email) {
    // Randomized delay: makes this branch indistinguishable from the
    // "user found + email sent" path timing-wise.
    await randomDelay();
    return OK_RESPONSE;
  }

  // Only allow password reset for accounts that have a password set.
  // OAuth-only accounts have no password_hash and cannot use this flow.
  if (!user.password_hash) {
    await randomDelay();
    return OK_RESPONSE;
  }

  try {
    const token = await createPasswordResetToken(user.id);
    const base = ctx.base.replace(/\/$/, "");
    const resetUrl = `${base}/reset-password?token=${token}`;

    await sendEmail({
      to: user.email,
      subject: "Reset your LeMedia password",
      text: `You requested a password reset for your LeMedia account.\n\nClick the link below to choose a new password. This link expires in 15 minutes and can only be used once.\n\n${resetUrl}\n\nIf you didn't request this, you can safely ignore this email.`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f0f;font-family:system-ui,-apple-system,sans-serif;color:#e5e5e5">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;overflow:hidden;max-width:100%">
        <tr><td style="padding:36px 40px 28px">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff">Password Reset</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#a3a3a3;line-height:1.6">
            You requested a password reset for your LeMedia account.
            Click the button below to choose a new password.
          </p>
          <a href="${resetUrl}"
             style="display:inline-block;background:#ffffff;color:#000000;text-decoration:none;font-weight:700;font-size:14px;padding:14px 28px;border-radius:8px;letter-spacing:.5px">
            Reset Password
          </a>
          <p style="margin:24px 0 0;font-size:13px;color:#737373;line-height:1.6">
            This link expires in <strong style="color:#a3a3a3">15 minutes</strong> and can only be used once.<br>
            If you didn't request this, you can safely ignore this email.
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #262626">
          <p style="margin:0;font-size:12px;color:#525252">
            If the button above doesn't work, paste this URL into your browser:<br>
            <span style="color:#737373;word-break:break-all">${resetUrl}</span>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
    });

    await logAuditEvent({
      action: "user.password_reset_requested",
      actor: user.username,
      ip,
    });
  } catch {
    // Swallow email/token errors: the user-facing response is always the same
    // generic message so we never leak whether the address is registered.
  }

  return OK_RESPONSE;
}
