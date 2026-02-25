import "server-only";

import { getPool } from "@/db";
import { decryptSecret } from "@/lib/encryption";
import { sendTelegramMessage } from "@/notifications/telegram";

type LinkedAdmin = {
  userId: number;
  username: string;
  telegramId: string;
  apiTokenEncrypted: string;
};

type JobFailureSummary = {
  jobName: string;
  message: string;
  count: number;
};

type ServiceDetail = {
  name: string;
  healthy: boolean;
};

const INTERNAL_APP_BASE_URL = (process.env.INTERNAL_APP_BASE_URL ?? "http://127.0.0.1:3010").replace(/\/$/, "");

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function listLinkedAdmins(): Promise<LinkedAdmin[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT tu.user_id, tu.telegram_id, tu.api_token_encrypted, u.username
     FROM telegram_users tu
     JOIN app_user u ON u.id = tu.user_id
     WHERE lower(coalesce(u.groups, '')) LIKE '%administrators%'`
  );

  return res.rows.map((row) => ({
    userId: row.user_id,
    username: row.username,
    telegramId: row.telegram_id,
    apiTokenEncrypted: row.api_token_encrypted,
  }));
}

async function countPendingRequests(): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*)::int AS count
     FROM media_request
     WHERE status = 'pending'`
  );
  return Number(res.rows[0]?.count ?? 0);
}

async function getTopJobFailures(hours = 24, limit = 5): Promise<JobFailureSummary[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT
        job_name,
        COALESCE(error, 'Unknown error') AS message,
        COUNT(*)::int AS count
     FROM job_history
     WHERE status = 'failure'
       AND started_at >= NOW() - ($1::text || ' hours')::interval
     GROUP BY job_name, COALESCE(error, 'Unknown error')
     ORDER BY COUNT(*) DESC, job_name ASC
     LIMIT $2`,
    [hours, limit]
  );

  return res.rows.map((row) => ({
    jobName: row.job_name,
    message: row.message,
    count: Number(row.count ?? 0),
  }));
}

async function getServiceHealth(apiToken: string): Promise<ServiceDetail[]> {
  const url = `${INTERNAL_APP_BASE_URL}/api/admin/status/health`;
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch service health: ${res.status}`);
  }

  const data = (await res.json()) as Record<string, unknown>;
  const details = Array.isArray((data as any)?.serviceDetails) ? (data as any).serviceDetails : [];

  const services: ServiceDetail[] = [];

  if ((data as any)?.jellyfin !== undefined) {
    services.push({
      name: "Jellyfin",
      healthy: !!(data as any).jellyfin,
    });
  }

  for (const svc of details) {
    if (!svc?.enabled) continue;
    services.push({
      name: String(svc.name ?? svc.type ?? "Unknown"),
      healthy: !!svc.healthy,
    });
  }

  return services;
}

export async function sendTelegramAdminDigestJob(): Promise<string> {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  if (!botToken) {
    return "Skipped: TELEGRAM_BOT_TOKEN is not configured";
  }

  const secretKey = (process.env.SERVICES_SECRET_KEY ?? "").trim();
  if (!secretKey) {
    return "Skipped: SERVICES_SECRET_KEY is not configured";
  }

  const [admins, pendingCount, failures] = await Promise.all([
    listLinkedAdmins(),
    countPendingRequests(),
    getTopJobFailures(24, 5),
  ]);

  if (admins.length === 0) {
    return "No linked admins found";
  }

  const failureLines =
    failures.length === 0
      ? "✅ No job failures in last 24h"
      : failures
          .map(
            (item, idx) =>
              `${idx + 1}. <b>${escHtml(item.jobName)}</b>: ${escHtml(item.message)} (${item.count})`
          )
          .join("\n");

  let sentCount = 0;

  for (const admin of admins) {
    const apiToken = decryptSecret(admin.apiTokenEncrypted);

    let failingServices: string[] = [];
    try {
      const services = await getServiceHealth(apiToken);
      failingServices = services.filter((item) => !item.healthy).map((item) => item.name);
    } catch {
      failingServices = ["Unable to fetch services"];
    }

    const serviceLine =
      failingServices.length === 0
        ? "✅ No failing services"
        : `⚠️ Failing services: ${failingServices.map(escHtml).join(", ")}`;

    const text =
      `🗓 <b>Admin Daily Digest</b>\n` +
      `Pending requests: <b>${pendingCount}</b>\n` +
      `${serviceLine}\n\n` +
      `<b>Top failures (24h)</b>\n${failureLines}`;

    await sendTelegramMessage({
      botToken,
      chatId: admin.telegramId,
      text,
      parseMode: "HTML",
    });
    sentCount += 1;
  }

  return `Sent to ${sentCount} admin(s)`;
}
