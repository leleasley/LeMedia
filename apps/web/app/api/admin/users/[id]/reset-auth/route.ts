import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { deleteAllUserCredentials, deleteMfaSessionsForUser, getUserById, resetUserMfaById, unlinkUserOidc } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest, { params }: { params: { id: string } | Promise<{ id: string }> }) {
    const user = await requireAdmin();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const resolvedParams = await Promise.resolve(params);
    const userId = Number(resolvedParams.id);
    if (!Number.isFinite(userId)) {
        return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const targetUser = await getUserById(userId);
    if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = await req.json();
    const { unlinkSso, resetOtp, removePasskeys } = body;
    const actions: string[] = [];

    if (resetOtp) {
        await resetUserMfaById(userId);
        actions.push("otp_reset");
    }

    if (removePasskeys) {
        await deleteAllUserCredentials(userId);
        actions.push("passkeys_removed");
    }

    if (unlinkSso) {
        await unlinkUserOidc(userId);
        actions.push("sso_unlinked");
    }

    if (actions.length > 0) {
        await logAuditEvent({
            action: "user.updated",
            actor: user.username,
            target: targetUser.username,
            metadata: { auth_reset: actions },
            ip: getClientIp(req),
        });
    }

    return NextResponse.json({ success: true, actions });
}
