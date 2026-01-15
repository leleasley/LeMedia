import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createWebAuthnChallenge, listUserCredentials, getUserByUsername } from "@/db";
import { getCookieBase, getRequestContext } from "@/lib/proxy";

export async function GET(req: NextRequest) {
  try {
    const ctx = getRequestContext(req);
    const rpID = new URL(ctx.base).hostname;
    const username = req.nextUrl.searchParams.get("username")?.trim();

    let allowCredentials = undefined;
    let userId: number | null = null;

    if (username) {
      const user = await getUserByUsername(username);
      if (user) {
        userId = user.id;
        const credentials = await listUserCredentials(user.id);
        allowCredentials = credentials.map((cred) => ({
          id: cred.id,
          type: "public-key" as const,
          transports: cred.transports as AuthenticatorTransport[],
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: "preferred",
    });

    const challengeId = await createWebAuthnChallenge(userId, options.challenge);

    const res = NextResponse.json(options);
    const cookieBase = getCookieBase(ctx, true);
    res.cookies.set("lemedia_webauthn_challenge", challengeId, { ...cookieBase, maxAge: 60 * 5 });

    return res;
  } catch (error) {
    console.error("[WebAuthn] Login options error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
