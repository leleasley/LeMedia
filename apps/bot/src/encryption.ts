import { createHash, createDecipheriv } from "crypto";

const ALGORITHM = "aes-256-gcm";

function buildKey(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

// Mirrors the encryptSecret/decryptSecret logic in apps/web/src/lib/encryption.ts
// Format: "version:ivBase64:encryptedBase64:tagBase64"
export function decryptSecret(payload: string, servicesSecretKey: string): string {
  const parts = payload.split(":");
  if (parts.length < 4) throw new Error("Invalid encrypted payload");

  // parts[0] is version, parts[1] is iv, parts[2] is encrypted, parts[3] is tag
  const [, ivB64, encryptedB64, tagB64] = parts;
  const key = buildKey(servicesSecretKey);
  const iv = Buffer.from(ivB64, "base64");
  const encrypted = Buffer.from(encryptedB64, "base64");
  const tag = Buffer.from(tagB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
