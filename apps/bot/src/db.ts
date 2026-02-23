import { Pool } from "pg";
import { randomBytes } from "crypto";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// Generate a random uppercase alphanumeric code for linking
function generateLinkCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) {
    code += chars[b % chars.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export async function createLinkToken(telegramId: string, telegramUsername?: string): Promise<string> {
  const p = getPool();
  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Delete any existing tokens for this telegram user
  await p.query("DELETE FROM telegram_link_tokens WHERE telegram_id = $1", [telegramId]);

  await p.query(
    `INSERT INTO telegram_link_tokens (code, telegram_id, telegram_username, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [code, telegramId, telegramUsername ?? null, expiresAt]
  );

  return code;
}

export async function getLinkedUser(
  telegramId: string
): Promise<{ userId: number; apiTokenEncrypted: string } | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT tu.user_id, tu.api_token_encrypted
     FROM telegram_users tu
     WHERE tu.telegram_id = $1`,
    [telegramId]
  );
  if (res.rows.length === 0) return null;
  return {
    userId: res.rows[0].user_id,
    apiTokenEncrypted: res.rows[0].api_token_encrypted
  };
}

export async function unlinkTelegramUser(telegramId: string): Promise<void> {
  const p = getPool();
  await p.query("DELETE FROM telegram_users WHERE telegram_id = $1", [telegramId]);
}

export async function isUserAdmin(userId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    "SELECT groups FROM app_user WHERE id = $1",
    [userId]
  );
  if (res.rows.length === 0) return false;

  // groups is stored as a comma-separated string e.g. "administrators,users"
  const raw: string = res.rows[0].groups ?? "";
  const groups = typeof raw === "string"
    ? raw.split(/[;,]/g).map((g: string) => g.trim().toLowerCase()).filter(Boolean)
    : [];

  const LEGACY: Record<string, string> = {
    admin: "administrators", admins: "administrators",
    administrator: "administrators", owner: "administrators"
  };
  return groups.some(g => (LEGACY[g] ?? g) === "administrators");
}
