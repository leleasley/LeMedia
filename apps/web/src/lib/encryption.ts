import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { z } from "zod";

const KeySchema = z.string().min(1);
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

type KeySpec = { version: string; key: Buffer };

let keySpecs: KeySpec[] | null = null;

function buildKeySpec(value: string, version: string): KeySpec {
  return { version, key: createHash("sha256").update(value).digest() };
}

function getKeySpecs(): KeySpec[] {
  if (keySpecs) return keySpecs;
  const currentRaw = KeySchema.parse(process.env.SERVICES_SECRET_KEY ?? "");
  const currentVersion = (process.env.SERVICES_SECRET_KEY_VERSION ?? "1").trim() || "1";
  const legacyRaw = (process.env.SERVICES_SECRET_KEY_PREVIOUS ?? "").trim();
  const legacyVersion = (process.env.SERVICES_SECRET_KEY_PREVIOUS_VERSION ?? "").trim();

  const specs: KeySpec[] = [buildKeySpec(currentRaw, currentVersion)];
  if (legacyRaw) {
    specs.push(buildKeySpec(legacyRaw, legacyVersion || "legacy"));
  }
  keySpecs = specs;
  return specs;
}

function getPrimaryKeySpec(): KeySpec {
  const specs = getKeySpecs();
  if (!specs.length) {
    throw new Error("SERVICES_SECRET_KEY is required");
  }
  return specs[0];
}

export function encryptSecret(value: string) {
  const spec = getPrimaryKeySpec();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, spec.key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Prefix with version for rotation support
  return `${spec.version}:${iv.toString("base64")}:${encrypted.toString("base64")}:${tag.toString("base64")}`;
}

export function decryptSecret(payload: string) {
  const parts = payload.split(":");
  const specs = getKeySpecs();

  const tryDecrypt = (spec: KeySpec, ivB64: string, encryptedB64: string, tagB64: string) => {
    const iv = Buffer.from(ivB64, "base64");
    const encrypted = Buffer.from(encryptedB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const decipher = createDecipheriv(ALGORITHM, spec.key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  };

  // Versioned payload: version:iv:enc:tag
  if (parts.length === 4) {
    const [version, ivB64, encryptedB64, tagB64] = parts;
    const candidate = specs.find(s => s.version === version) ?? specs[0];
    try {
      return tryDecrypt(candidate, ivB64, encryptedB64, tagB64);
    } catch {
      // Fall through to legacy brute-force below
    }
    for (const spec of specs) {
      try {
        return tryDecrypt(spec, ivB64, encryptedB64, tagB64);
      } catch {
        // try next
      }
    }
    throw new Error("Unable to decrypt payload with available keys");
  }

  // Legacy payload: iv:enc:tag
  if (parts.length === 3) {
    const [ivB64, encryptedB64, tagB64] = parts;
    for (const spec of specs) {
      try {
        return tryDecrypt(spec, ivB64, encryptedB64, tagB64);
      } catch {
        // try next
      }
    }
  }

  throw new Error("Invalid encrypted payload");
}
