import "server-only";
import { createHash, randomBytes } from "crypto";

const USER_TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_TOKEN_LENGTH = 20;
const DEFAULT_GROUP_SIZE = 4;

export function normalizeUserApiToken(token: string): string {
  return String(token || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function hashUserApiToken(token: string): string {
  const normalized = normalizeUserApiToken(token);
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function generateUserApiToken(length = DEFAULT_TOKEN_LENGTH, groupSize = DEFAULT_GROUP_SIZE): string {
  const bytes = randomBytes(length);
  let token = "";
  for (const b of bytes) {
    token += USER_TOKEN_ALPHABET[b % USER_TOKEN_ALPHABET.length];
  }
  if (!groupSize || groupSize <= 0) return token;
  const grouped: string[] = [];
  for (let i = 0; i < token.length; i += groupSize) {
    grouped.push(token.slice(i, i + groupSize));
  }
  return grouped.join("-");
}
