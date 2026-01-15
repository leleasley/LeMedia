import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getPool } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const currentUser = await getUser();
        if (!currentUser?.isAdmin) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const csrf = requireCsrf(request);
        if (csrf) return csrf;

        const db = getPool();
        const { id } = await params;
        const userId = parseInt(id);

        const targetRes = await db.query("SELECT username FROM app_user WHERE id = $1", [userId]);
        const targetUsername = targetRes.rows[0]?.username as string | undefined;

        // Unlink Jellyfin account
        await db.query(
            `UPDATE app_user
       SET jellyfin_user_id = NULL,
           jellyfin_username = NULL,
           jellyfin_device_id = NULL,
           jellyfin_auth_token = NULL
       WHERE id = $1`,
            [userId]
        );

        await logAuditEvent({
            action: "user.jellyfin_unlinked",
            actor: currentUser.username,
            target: targetUsername ?? String(userId),
            ip: getClientIp(request),
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Error unlinking Jellyfin account:", error);
        return NextResponse.json(
            { error: "Failed to unlink account" },
            { status: 500 }
        );
    }
}
