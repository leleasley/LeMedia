import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash, resetUserMfaById } from "@/db";
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

        await resetUserMfaById(dbUser.id);

        // Log MFA disable
        await logAuditEvent({
            action: "user.mfa_reset",
            actor: dbUser.username,
            metadata: { action: "disabled" },
            ip: getClientIp(req),
        });

        const res = NextResponse.redirect(new URL("/login", base));
        res.cookies.set("lemedia_flash", "MFA disabled. Please sign in again.", { ...cookieOptions, maxAge: 120 });
        return res;
    } catch {
        return NextResponse.redirect(new URL("/login", base));
    }
}
