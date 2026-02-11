import { NextRequest, NextResponse } from "next/server";
import { addUserPasswordHistory, getPool, isSetupComplete, markSetupComplete } from "@/db";
import { hashPassword } from "@/lib/auth-utils";
import { logAuditEvent } from "@/lib/audit-log";
import { getRequestContext, isSameOriginRequest } from "@/lib/proxy";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { serializeGroups } from "@/lib/groups";
import { getPasswordPolicyResult } from "@/lib/password-policy";
import { verifyTurnstileToken } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ctx = getRequestContext(request);
    if (!isSameOriginRequest(request, ctx.base)) {
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    }

    const ip = getClientIp(request);
    const rate = await checkRateLimit(`setup-complete:${ip}`, { windowMs: 10 * 60 * 1000, max: 5 });
    if (!rate.ok) {
      return rateLimitResponse(rate.retryAfterSec);
    }

    // Security: Only allow if setup not complete
    const setupComplete = await isSetupComplete();
    if (setupComplete) {
      return NextResponse.json(
        { error: "Setup has already been completed" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { username, email, password, turnstileToken } = body;

    // Validation
    if (!username?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { error: "Username, email, and password are required" },
        { status: 400 }
      );
    }

    if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      const token = typeof turnstileToken === "string" ? turnstileToken : "";
      const turnstileValid = await verifyTurnstileToken(token, ip);
      if (!turnstileValid) {
        return NextResponse.json({ error: "Turnstile verification failed" }, { status: 400 });
      }
    }

    // Validate username format
    const usernameClean = username.trim().toLowerCase();
    const emailClean = email.trim().toLowerCase();
    if (usernameClean.length < 3 || usernameClean.length > 50) {
      return NextResponse.json(
        { error: "Username must be between 3 and 50 characters" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailClean)) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    const policy = getPasswordPolicyResult({ password, username: usernameClean });
    if (policy.errors.length) {
      return NextResponse.json({ error: policy.errors[0] }, { status: 400 });
    }

    const db = getPool();

    // Check if user already exists (edge case)
    const existing = await db.query(
      "SELECT id FROM app_user WHERE username = $1 OR email = $2",
      [usernameClean, emailClean]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "Username or email already exists" },
        { status: 409 }
      );
    }

    // Hash password and create admin user
    const passwordHash = await hashPassword(password);

    const result = await db.query(
      `INSERT INTO app_user (username, email, password_hash, groups, created_at, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [usernameClean, emailClean, passwordHash, serializeGroups(["administrators"])]
    );
    await addUserPasswordHistory(result.rows[0].id, passwordHash);

    // Mark setup as complete
    await markSetupComplete();

    // Log audit event
    await logAuditEvent({
      action: "user.created",
      actor: "setup_wizard",
      target: usernameClean,
      ip,
      metadata: { isInitialAdmin: true },
    });

    logger.info(`[Setup] Initial admin user created: ${usernameClean}`);

    return NextResponse.json({
      success: true,
      userId: result.rows[0].id,
    });
  } catch (error: unknown) {
    // Handle unique constraint violation
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json(
        { error: "Username or email already exists" },
        { status: 409 }
      );
    }
    logger.error("[Setup] Failed to complete setup:", error);
    return NextResponse.json(
      { error: "Failed to complete setup" },
      { status: 500 }
    );
  }
}
