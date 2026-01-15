import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { getUser } from "@/auth";
import { getWebAuthnChallenge, deleteWebAuthnChallenge, addUserCredential, getUserWithHash } from "@/db";
import { getRequestContext } from "@/lib/proxy";

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const body = await req.json();
    const ctx = getRequestContext(req);
    const rpID = new URL(ctx.base).hostname;
    const origin = ctx.base;

    const challengeId = req.cookies.get("lemedia_webauthn_challenge")?.value;
    if (!challengeId) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 400 });
    }

    const storedChallenge = await getWebAuthnChallenge(challengeId);
    if (!storedChallenge) {
      console.error(`[WebAuthn] Challenge not found or expired: ${challengeId}`);
      return NextResponse.json({ error: "Challenge expired or invalid" }, { status: 400 });
    }
    if (storedChallenge.user_id !== dbUser.id) {
      console.error(`[WebAuthn] User mismatch: challenge user ${storedChallenge.user_id} vs session user ${dbUser.id}`);
      return NextResponse.json({ error: "User mismatch during verification" }, { status: 400 });
    }

    await deleteWebAuthnChallenge(challengeId);

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      await addUserCredential({
        id: credential.id,
        userId: dbUser.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: body.response.transports,
      });

      return NextResponse.json({ verified: true });
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  } catch (error) {
    console.error("[WebAuthn] Register verify error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
