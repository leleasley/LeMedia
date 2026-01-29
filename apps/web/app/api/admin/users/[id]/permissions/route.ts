import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, requireUser } from "@/auth";
import { getPool } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await requireUser();
        if (currentUser instanceof NextResponse) return currentUser;

        const db = getPool();
        const { id } = await params;
        const userId = parseInt(id);

        const result = await db.query(
            "SELECT permissions, username FROM app_user WHERE id = $1",
            [userId]
        );

        if (result.rows.length === 0) {
            return jsonResponseWithETag(request, { error: "User not found" }, { status: 404 });
        }

        const targetUser = result.rows[0];
        const targetUsername = targetUser.username ?? "";
        if (!currentUser?.isAdmin && currentUser?.username !== targetUsername) {
            return jsonResponseWithETag(request, { error: "Unauthorized" }, { status: 401 });
        }

        // Return permissions or default empty object
        const permissions = result.rows[0].permissions || {};
        return jsonResponseWithETag(request, permissions);
    } catch (error) {
        logger.error("Error fetching permissions:", error);
        return jsonResponseWithETag(request, 
            { error: "Failed to fetch permissions" },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await requireAdmin();
        if (currentUser instanceof NextResponse) return currentUser;
        const csrf = requireCsrf(request);
        if (csrf) return csrf;

        const db = getPool();
        const { id } = await params;
        const userId = parseInt(id);
        const body = await request.json();

        const targetRes = await db.query("SELECT username FROM app_user WHERE id = $1", [userId]);
        const targetUsername = targetRes.rows[0]?.username as string | undefined;

        // Save permissions
        await db.query(
            "UPDATE app_user SET permissions = $1 WHERE id = $2",
            [JSON.stringify(body.permissions), userId]
        );

        await logAuditEvent({
            action: "user.permissions_changed",
            actor: currentUser.username,
            target: targetUsername ?? String(userId),
            metadata: { fields: ["permissions"] },
            ip: getClientIp(request),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Error saving permissions:", error);
        return NextResponse.json(
            { error: "Failed to save permissions" },
            { status: 500 }
        );
    }
}
