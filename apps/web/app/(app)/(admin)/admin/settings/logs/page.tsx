import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { getPool } from "@/db";
import { AdminLogsPageClient } from "@/components/Settings/Logs/AdminLogsPageClient";

export const metadata = {
  title: "Audit Logs - LeMedia",
};

function normalizePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return parsed;
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams?: { page?: string };
}) {
  const user = await getUser().catch(() => null);
  if (!user) redirect("/login");
  if (!user.isAdmin) {
    return (
      <div className="rounded-lg border border-white/10 bg-slate-900/60 p-8 shadow-lg shadow-black/10">
        <div className="text-lg font-bold">Forbidden</div>
        <div className="mt-2 text-sm opacity-75">You&apos;re not in the admin group.</div>
      </div>
    );
  }

  const page = normalizePage(searchParams?.page);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
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
    [pageSize, offset]
  );
  const rows = rowsRes.rows as Array<{
    id: number;
    action: string;
    actor: string;
    target: string | null;
    metadata: unknown;
    ip: string | null;
    created_at: string;
  }>;

  return (
    <AdminLogsPageClient
      initialData={{
        results: rows,
        pageInfo: {
          page,
          pages: Math.max(1, Math.ceil(total / pageSize)),
          results: rows.length,
          total,
          limit: pageSize,
        },
      }}
      initialPage={page}
    />
  );
}
