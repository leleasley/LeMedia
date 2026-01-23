import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { logger } from "@/lib/logger";

export type SessionData = {
  username: string;
  groups: string[];
  exp: number;
  jti: string;
};

const SessionSecretSchema = z.string().min(32);

function getSessionSecret(): Uint8Array {
  const raw = SessionSecretSchema.parse(process.env.SESSION_SECRET);
  return new TextEncoder().encode(raw);
}

export async function createSessionToken(input: { username: string; groups: string[]; maxAgeSeconds: number; jti: string }) {
  const exp = Math.floor(Date.now() / 1000) + input.maxAgeSeconds;
  return new SignJWT({ username: input.username, groups: input.groups, jti: input.jti })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(exp)
    .setSubject(input.username)
    .sign(getSessionSecret());
}

export async function verifySessionToken(token: string): Promise<SessionData | null> {
  try {
    const { payload } = await jwtVerify(token, getSessionSecret(), {
      algorithms: ["HS256"],
      clockTolerance: 120
    });
    const username = typeof payload.username === "string" ? payload.username : "";
    const groups = Array.isArray(payload.groups) ? payload.groups.map(String).filter(Boolean) : [];
    const exp = typeof payload.exp === "number" ? payload.exp : 0;
    const jti = typeof payload.jti === "string" ? payload.jti : "";
    if (!username || !exp || !jti) return null;
    return { username, groups, exp, jti };
  } catch (err) {
    // Token verification failures are expected (expired, invalid, etc.) - only log in debug
    // Never log in production to prevent information disclosure
    if (process.env.AUTH_DEBUG === "1" && process.env.NODE_ENV !== "production") {
      logger.debug("[Session] Token verification failed", { error: err instanceof Error ? err.message : String(err) });
    }
    return null;
  }
}
