import crypto from "crypto";

const TOKEN_VERSION = "v1";

function getSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("SESSION_SECRET is required to sign unsubscribe tokens");
  }
  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

export function createUnsubscribeToken(userId: number, expiresAt: Date) {
  const payload = `${TOKEN_VERSION}:${userId}:${expiresAt.toISOString()}`;
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(payload);
  const signature = hmac.digest("hex");
  return `${base64UrlEncode(payload)}.${signature}`;
}

export function verifyUnsubscribeToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, signature] = parts;
  const payload = base64UrlDecode(encoded);
  const hmac = crypto.createHmac("sha256", getSecret());
  hmac.update(payload);
  const expected = hmac.digest("hex");
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;

  const [version, userIdRaw, expiresRaw] = payload.split(":");
  if (version !== TOKEN_VERSION) return null;
  const userId = Number(userIdRaw);
  if (!Number.isFinite(userId)) return null;
  const expiresAt = new Date(expiresRaw);
  if (Number.isNaN(expiresAt.getTime())) return null;
  if (expiresAt.getTime() < Date.now()) return null;
  return { userId, expiresAt };
}
