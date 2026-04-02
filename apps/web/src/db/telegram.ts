import { getPool, ensureSchema } from "./core";


export async function getTelegramUserByUserId(userId: number): Promise<{ telegram_id: string } | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT telegram_id FROM telegram_users WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return res.rows[0] ?? null;
}


export async function listLinkedTelegramUsers(): Promise<{ userId: number; telegramId: string; username: string }[]> {
  await ensureSchema();
  const p = getPool();
  const res = await p.query(
    `SELECT tu.user_id, tu.telegram_id, u.username
     FROM telegram_users tu
     JOIN users u ON u.id = tu.user_id
     WHERE COALESCE(u.banned, FALSE) = FALSE
     ORDER BY u.username ASC`
  );
  return res.rows.map((row) => ({
    userId: Number(row.user_id),
    telegramId: String(row.telegram_id),
    username: String(row.username)
  }));
}
