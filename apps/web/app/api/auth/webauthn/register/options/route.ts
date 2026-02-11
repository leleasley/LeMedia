import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransport } from "@simplewebauthn/server";
import { getUser } from "@/auth";
import { logger } from "@/lib/logger";
import { createWebAuthnChallenge, listUserCredentials, getUserWithHash } from "@/db";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    
    // Rate limit: 20 registration attempts per hour per IP
    const rateLimitResult = await checkRateLimit(`webauthn_register:${ip}`, {
      windowMs: 60 * 60 * 1000,
      max: 20
    });
    
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSec) } }
      );
    }
    
    const user = await getUser();
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const ctx = getRequestContext(req);
    const rpID = new URL(ctx.base).hostname;
    const existingCredentials = await listUserCredentials(dbUser.id);

    const options = await generateRegistrationOptions({
      rpName: "LeMedia",
      rpID,
      userID: new TextEncoder().encode(String(dbUser.id)),
      userName: user.username,
      attestationType: "none",
      excludeCredentials: existingCredentials.map((cred) => ({
        id: cred.id,
        type: "public-key",
        transports: cred.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
      },
    });

    const challengeId = await createWebAuthnChallenge(dbUser.id, options.challenge);

    const res = NextResponse.json(options);
    const cookieBase = getCookieBase(ctx, true);
    res.cookies.set("lemedia_webauthn_challenge", challengeId, { ...cookieBase, maxAge: 60 * 5 });

    return res;
  } catch (error) {
    logger.error("[WebAuthn] Register options error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
