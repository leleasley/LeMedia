import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { createWebAuthnChallenge, listUserCredentials, getUserByUsername } from "@/db";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { getClientIp } from "@/lib/rate-limit";
import { z } from "zod";

const TurnstileSchema = z.object({
  turnstileToken: z.string().trim().min(1).optional()
});

export async function GET(req: NextRequest) {
  if (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    return NextResponse.json({ error: "Turnstile required" }, { status: 400 });
  }
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

export async function POST(req: NextRequest) {
  try {
    const body = TurnstileSchema.parse(await req.json());
    const ip = getClientIp(req);
    const turnstileValid = await verifyTurnstileToken(body.turnstileToken ?? "", ip);
    if (!turnstileValid) {
      return NextResponse.json({ error: "Invalid security challenge" }, { status: 400 });
    }

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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("[WebAuthn] Login options error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
