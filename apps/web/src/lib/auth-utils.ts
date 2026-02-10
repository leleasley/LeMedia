import { randomBytes, scrypt, timingSafeEqual } from "crypto";

function scryptAsync(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: Parameters<typeof scrypt>[3]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const callback = (err: NodeJS.ErrnoException | null, derivedKey: Buffer) => {
      if (err) return reject(err);
      resolve(derivedKey);
    };
    if (options) {
      scrypt(password, salt, keylen, options, callback);
    } else {
      scrypt(password, salt, keylen, callback);
    }
  });
}
const SCRYPT_KEY_LEN = 64;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function formatScryptScheme() {
  return `scrypt$N=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}`;
}

function parseScryptScheme(raw: string): { N: number; r: number; p: number } | null {
  if (raw === "scrypt") {
    return { ...SCRYPT_PARAMS };
  }
  if (!raw.startsWith("scrypt$")) return null;
  const values = raw.slice("scrypt$".length).split(",");
  const parsed: Record<string, number> = {};
  for (const entry of values) {
    const [key, value] = entry.split("=");
    const num = Number(value);
    if (!key || !Number.isFinite(num)) return null;
    parsed[key.trim()] = num;
  }
  const N = parsed.N ?? SCRYPT_PARAMS.N;
  const r = parsed.r ?? SCRYPT_PARAMS.r;
  const p = parsed.p ?? SCRYPT_PARAMS.p;
  return { N, r, p };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LEN, {
    ...SCRYPT_PARAMS,
    maxmem: SCRYPT_MAXMEM
  });
  return `${formatScryptScheme()}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (!scheme || !saltHex || !hashHex) return false;
  const params = parseScryptScheme(scheme);
  if (!params) return false;
  const salt = Buffer.from(saltHex, "hex");
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LEN, {
    ...params,
    maxmem: SCRYPT_MAXMEM
  });
  const storedBuf = Buffer.from(hashHex, "hex");
  return derived.length === storedBuf.length && timingSafeEqual(derived, storedBuf);
}
