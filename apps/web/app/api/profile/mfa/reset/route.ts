import { NextRequest, NextResponse } from "next/server";
import { generateSecret } from "otplib";
import { requireUser } from "@/auth";
import { createMfaSession, deleteMfaSessionsForUser, getUserWithHash, resetUserMfaById } from "@/db";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
    const ctx = getRequestContext(req);
    const base = ctx.base;
    const cookieOptions = getCookieBase(ctx, true);

    try {
        const appUser = await requireUser();
        if (appUser instanceof NextResponse) {
            return NextResponse.redirect(new URL("/login", base));
        }
        const csrf = requireCsrf(req);
        if (csrf) return csrf;
        const dbUser = await getUserWithHash(appUser.username);
        if (!dbUser) {
            return NextResponse.redirect(new URL("/login", base));
        }

        // Clear any existing MFA and sessions for this user
        await resetUserMfaById(dbUser.id);
        await deleteMfaSessionsForUser(dbUser.id);

        // Log MFA reset
        await logAuditEvent({
            action: "user.mfa_reset",
            actor: dbUser.username,
            ip: getClientIp(req),
        });

        // Create a fresh setup session and send the user to setup
        const secret = generateSecret();
        const setupSession = await createMfaSession({
            userId: dbUser.id,
            type: "setup",
            secret,
            expiresInSeconds: 60 * 15
        });

        const res = NextResponse.redirect(new URL("/mfa_setup", base));
        res.cookies.set("lemedia_mfa_token", setupSession.id, { ...cookieOptions, maxAge: 60 * 15 });
        return res;
    } catch {
        return NextResponse.redirect(new URL("/login", base));
    }
}
