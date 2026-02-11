import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticatorTransport } from "@simplewebauthn/server";
import { logger } from "@/lib/logger";
import {
  getWebAuthnChallenge,
  deleteWebAuthnChallenge,
  getCredentialById,
  updateCredentialCounter,
  getUserById,
  getSettingInt,
  createUserSession
} from "@/db";
import { createSessionToken } from "@/lib/session";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp, checkRateLimit } from "@/lib/rate-limit";
import { randomUUID } from "crypto";
import { summarizeUserAgent } from "@/lib/device-info";
import { normalizeGroupList } from "@/lib/groups";

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req);
    
    // Rate limit: 10 attempts per 15 minutes per IP
    const rateLimitResult = await checkRateLimit(`webauthn_login:${ip}`, {
      windowMs: 15 * 60 * 1000,
      max: 10
    });
    
    if (!rateLimitResult.ok) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSec) } }
      );
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
      logger.warn("[WebAuthn] Challenge not found or expired", { challengeId });
      return NextResponse.json({ error: "Challenge expired or invalid" }, { status: 400 });
    }

    await deleteWebAuthnChallenge(challengeId);

    const credential = await getCredentialById(body.id);
    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 400 });
    }

    // If challenge was tied to a specific user, verify it matches the credential's owner
    if (storedChallenge.user_id && storedChallenge.user_id !== credential.userId) {
      logger.warn("[WebAuthn] User mismatch during verification", { challengeUserId: storedChallenge.user_id, credentialUserId: credential.userId });
      return NextResponse.json({ error: "User mismatch" }, { status: 400 });
    }

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransport[],
      },
    });

    if (verification.verified) {
      const { authenticationInfo } = verification;
      await updateCredentialCounter(credential.id, authenticationInfo.newCounter);

      const user = await getUserById(credential.userId);
      if (!user) {
        return NextResponse.json({ error: "User not found" }, { status: 400 });
      }

      if (user.banned) {
        return NextResponse.json({ error: "Account suspended" }, { status: 403 });
      }

      await logAuditEvent({
        action: "user.login",
        actor: user.username,
        ip: ip,
        metadata: { method: "webauthn" }
      });

      const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
      const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
      const groups = normalizeGroupList(user.groups);

      const jti = randomUUID();
      const token = await createSessionToken({ username: user.username, groups, maxAgeSeconds: sessionMaxAge, jti });
      const userAgent = req.headers.get("user-agent");
      const deviceLabel = summarizeUserAgent(userAgent);
      await createUserSession(user.id, jti, new Date(Date.now() + sessionMaxAge * 1000), {
        userAgent,
        deviceLabel,
        ipAddress: ip
      });
      
      const res = NextResponse.json({ verified: true });
      const cookieOptions = getCookieBase(ctx, true);
      res.cookies.set("lemedia_session", token, { ...cookieOptions, maxAge: sessionMaxAge });
      // Clear stale flash and set login success for toast display
      res.cookies.set("lemedia_flash", "", { ...cookieOptions, maxAge: 0 });
      res.cookies.set("lemedia_flash_error", "", { ...cookieOptions, maxAge: 0 });
      res.cookies.set("lemedia_flash", "login-success", { ...cookieOptions, maxAge: 120 });
      
      // Clear login related cookies
      res.cookies.set("lemedia_user", "", { ...cookieOptions, maxAge: 0 });
      res.cookies.set("lemedia_mfa_token", "", { ...cookieOptions, maxAge: 0 });
      res.cookies.set("lemedia_webauthn_challenge", "", { ...cookieOptions, maxAge: 0 });
      res.cookies.set("lemedia_session_reset", "", { ...cookieOptions, httpOnly: false, maxAge: 0 });

      return res;
    }

    return NextResponse.json({ error: "Verification failed" }, { status: 400 });
  } catch (error) {
    logger.error("[WebAuthn] Login verify error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
