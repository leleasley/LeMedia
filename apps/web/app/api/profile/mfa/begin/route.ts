import { NextRequest, NextResponse } from "next/server";
import { authenticator } from "otplib";
import { requireUser } from "@/auth";
import { createMfaSession, getUserWithHash } from "@/db";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { requireCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
    try {
        const ctx = getRequestContext(req);
        const base = ctx.base;
        const cookieOptions = getCookieBase(ctx, true);

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

        const secret = authenticator.generateSecret();
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
        // Fallback to login if anything goes wrong
        const ctx = getRequestContext(req);
        return NextResponse.redirect(new URL("/login", ctx.base));
    }
}
