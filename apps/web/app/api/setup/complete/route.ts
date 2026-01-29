import { NextRequest, NextResponse } from "next/server";
import { getPool, isSetupComplete, markSetupComplete } from "@/db";
import { hashPassword } from "@/lib/auth-utils";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { serializeGroups } from "@/lib/groups";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Security: Only allow if setup not complete
    const setupComplete = await isSetupComplete();
    if (setupComplete) {
      return NextResponse.json(
        { error: "Setup has already been completed" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { username, email, password } = body;

    // Validation
    if (!username?.trim() || !email?.trim() || !password) {
      return NextResponse.json(
        { error: "Username, email, and password are required" },
        { status: 400 }
      );
    }

    // Validate username format
    const usernameClean = username.trim().toLowerCase();
    if (usernameClean.length < 3 || usernameClean.length > 50) {
      return NextResponse.json(
        { error: "Username must be between 3 and 50 characters" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: "Please enter a valid email address" },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const db = getPool();

    // Check if user already exists (edge case)
    const existing = await db.query(
      "SELECT id FROM app_user WHERE username = $1 OR email = $2",
      [usernameClean, email.trim()]
    );

    if (existing.rows.length > 0) {
      return NextResponse.json(
        { error: "Username or email already exists" },
        { status: 409 }
      );
    }

    // Hash password and create admin user
    const passwordHash = hashPassword(password);

    const result = await db.query(
      `INSERT INTO app_user (username, email, password_hash, groups, created_at, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
      [usernameClean, email.trim(), passwordHash, serializeGroups(["administrators"])]
    );

    // Mark setup as complete
    await markSetupComplete();

    // Log audit event
    await logAuditEvent({
      action: "user.created",
      actor: "setup_wizard",
      target: usernameClean,
      ip: getClientIp(request),
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
