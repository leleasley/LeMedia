import crypto from "crypto";

const HASH_PREFIX = "scrypt";

function getShareSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error("SESSION_SECRET is required for share auth");
  }
  return secret;
}

export function hashSharePassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64);
  return `${HASH_PREFIX}$${salt}$${derived.toString("hex")}`;
}

export function verifySharePassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== HASH_PREFIX) return false;
  const [, salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signShareAccess(shareId: number, passwordHash: string): string {
  const hmac = crypto.createHmac("sha256", getShareSecret());
  hmac.update(`${shareId}:${passwordHash}`);
  return hmac.digest("hex");
}

export function isShareAccessValid(
  shareId: number,
  passwordHash: string,
  token: string | undefined
): boolean {
  if (!token) return false;
  const expected = signShareAccess(shareId, passwordHash);
  if (token.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}
