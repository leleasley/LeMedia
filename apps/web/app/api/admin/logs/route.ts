import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getPool } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseIntParam(value: string | null | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const { searchParams } = request.nextUrl;
  const page = parseIntParam(searchParams.get("page"), 1);
  const limitRaw = parseIntParam(searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = Math.min(limitRaw, MAX_LIMIT);
  const offset = (page - 1) * limit;

  const db = getPool();
  const totalRes = await db.query("SELECT COUNT(*)::int AS count FROM audit_log");
  const total = Number(totalRes.rows[0]?.count ?? 0);
  const rowsRes = await db.query(
    `
    SELECT id, action, actor, target, metadata, ip, created_at
    FROM audit_log
    ORDER BY created_at DESC
    LIMIT $1
    OFFSET $2
    `,
    [limit, offset]
  );

  const response = NextResponse.json({
    results: rowsRes.rows,
    pageInfo: {
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      results: rowsRes.rows.length,
      total,
      limit,
    },
  });
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export async function DELETE(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const db = getPool();
  await db.query("DELETE FROM audit_log");

  return NextResponse.json({ ok: true });
}
