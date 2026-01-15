import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getPool } from "@/db";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { clearMediaServiceCache } from "@/lib/media-services";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

type Row = { id: number; api_key_encrypted: string };

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const pool = getPool();
  const client = await pool.connect();
  let processed = 0;
  let updated = 0;
  let errors = 0;

  try {
    await client.query("BEGIN");
    const res = await client.query<Row>(
      `SELECT id, api_key_encrypted FROM media_service ORDER BY id`
    );
    for (const row of res.rows) {
      processed += 1;
      try {
        const decrypted = decryptSecret(row.api_key_encrypted);
        const reencrypted = encryptSecret(decrypted);
        await client.query(
          `UPDATE media_service SET api_key_encrypted = $1, updated_at = NOW() WHERE id = $2`,
          [reencrypted, row.id]
        );
        updated += 1;
      } catch {
        errors += 1;
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "Failed to rotate secrets" }, { status: 500 });
  } finally {
    client.release();
  }

  clearMediaServiceCache();

  await logAuditEvent({
    action: "admin.settings_changed",
    actor: user.username,
    metadata: { section: "rotate_secrets", processed, updated, errors },
    ip: getClientIp(req)
  });

  return NextResponse.json({ processed, updated, errors });
}
