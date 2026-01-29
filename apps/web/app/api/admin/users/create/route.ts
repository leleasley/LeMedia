import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getPool } from "@/db";
import { hashPassword } from "@/lib/auth-utils";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { serializeGroups } from "@/lib/groups";

export async function POST(request: NextRequest) {
    try {
        const currentUser = await requireAdmin();
        if (currentUser instanceof NextResponse) return currentUser;
        const csrf = requireCsrf(request);
        if (csrf) return csrf;

        const body = await request.json();
        const { username, email, password } = body;

        if (!username || !email || !password) {
            return NextResponse.json(
                { error: "Username, email, and password are required" },
                { status: 400 }
            );
        }

        const db = getPool();

        // Check if user already exists
        const existing = await db.query(
            "SELECT id FROM app_user WHERE username = $1 OR email = $2",
            [username, email]
        );

        if (existing.rows.length > 0) {
            return NextResponse.json(
                { error: "User with this username or email already exists" },
                { status: 409 }
            );
        }

        // Hash password
        const passwordHash = hashPassword(password);

        // Create user
        const result = await db.query(
            `INSERT INTO app_user (username, email, password_hash, groups, created_at, last_seen_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id`,
            [username, email, passwordHash, serializeGroups(["users"])]
        );

        await logAuditEvent({
            action: "user.created",
            actor: currentUser.username,
            target: username,
            ip: getClientIp(request),
        });

        return NextResponse.json({
            success: true,
            userId: result.rows[0].id,
        });
    } catch (error) {
        logger.error("Error creating user", error);
        return NextResponse.json(
            { error: "Failed to create user" },
            { status: 500 }
        );
    }
}
