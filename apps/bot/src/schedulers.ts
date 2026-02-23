import { Bot } from "grammy";
import { getServiceHealth } from "./api";
import {
  completeWatchAlert,
  countPendingRequests,
  getRequestStatusState,
  getTopJobErrors,
  listLinkedAdmins,
  listLinkedRequestStatuses,
  listTriggeredWatchAlerts,
  upsertRequestStatusState,
  withAdvisoryLock,
} from "./db";
import { decryptSecret } from "./encryption";
import { isDigestSentForDate, markDigestSentForDate } from "./state";

const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
const SERVICES_SECRET_KEY = process.env.SERVICES_SECRET_KEY ?? "";
const DIGEST_HOUR_UTC = Number(process.env.TELEGRAM_ADMIN_DIGEST_HOUR_UTC ?? "9");

function escHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function mediaLink(requestType: "movie" | "episode", tmdbId: number): string {
  if (!APP_BASE_URL) return "";
  const path = requestType === "movie" ? "movie" : "tv";
  return `${APP_BASE_URL}/${path}/${tmdbId}`;
}

function failedRetryHint(reason: string | null): string {
  const value = (reason ?? "").toLowerCase();
  if (value.includes("radarr")) {
    return "Try checking Radarr queue/health and profile settings.";
  }
  if (value.includes("sonarr")) {
    return "Try checking Sonarr queue/health and series monitor status.";
  }
  if (value.includes("timeout") || value.includes("timed out")) {
    return "Looks like a timeout — try again in a few minutes.";
  }
  if (value.includes("unauthorized") || value.includes("forbidden")) {
    return "Auth issue detected — re-check API keys/permissions.";
  }
  return "Please review request comments/logs in LeMedia and retry.";
}

async function sendRequestStatusAndWatchAlerts(bot: Bot) {
  await withAdvisoryLock(450001, async () => {
    const rows = await listLinkedRequestStatuses();

    for (const row of rows) {
      const prev = await getRequestStatusState(row.telegramId, row.requestId);

      if (!prev) {
        await upsertRequestStatusState({
          telegramId: row.telegramId,
          requestId: row.requestId,
          lastStatus: row.status,
          lastReason: row.statusReason,
        });
        continue;
      }

      const changed =
        prev.lastStatus !== row.status ||
        (row.status === "failed" && (prev.lastReason ?? "") !== (row.statusReason ?? ""));

      if (!changed) continue;

      let message = "";
      if (row.status === "available") {
        const link = mediaLink(row.requestType, row.tmdbId);
        message =
          `✅ <b>${escHtml(row.title)}</b> is now available!` +
          (link ? `\n<a href="${link}">Open in LeMedia →</a>` : "");
      } else if (row.status === "downloading") {
        const link = mediaLink(row.requestType, row.tmdbId);
        message =
          `⬇️ Download started for <b>${escHtml(row.title)}</b>.` +
          (link ? `\n<a href="${link}">Track in LeMedia →</a>` : "");
      } else if (row.status === "failed") {
        const reason = row.statusReason ? `\nReason: <i>${escHtml(row.statusReason)}</i>` : "";
        const hint = failedRetryHint(row.statusReason);
        message =
          `❌ Download failed for <b>${escHtml(row.title)}</b>.${reason}\n💡 ${escHtml(hint)}`;
      }

      if (message) {
        await bot.api
          .sendMessage(row.telegramId, message, {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          })
          .catch(() => {});
      }

      await upsertRequestStatusState({
        telegramId: row.telegramId,
        requestId: row.requestId,
        lastStatus: row.status,
        lastReason: row.statusReason,
      });
    }

    const readyAlerts = await listTriggeredWatchAlerts();
    for (const alert of readyAlerts) {
      const link = APP_BASE_URL ? `${APP_BASE_URL}/${alert.mediaType}/${alert.tmdbId}` : "";
      const text =
        `🔔 <b>${escHtml(alert.title)}</b> is available now!` +
        (link ? `\n<a href="${link}">Open in LeMedia →</a>` : "");

      await bot.api
        .sendMessage(alert.telegramId, text, {
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        })
        .catch(() => {});

      await completeWatchAlert(alert.alertId);
    }
  });
}

async function sendAdminDailyDigest(bot: Bot) {
  await withAdvisoryLock(450002, async () => {
    const now = new Date();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();

    if (hour !== DIGEST_HOUR_UTC || minute > 10) return;

    const dateKey = now.toISOString().slice(0, 10);
    const alreadySent = await isDigestSentForDate(dateKey);
    if (alreadySent) return;

    const admins = await listLinkedAdmins();
    if (admins.length === 0) {
      await markDigestSentForDate(dateKey);
      return;
    }

    const pending = await countPendingRequests();
    const topErrors = await getTopJobErrors(24, 3);

    for (const admin of admins) {
      const apiToken = decryptSecret(admin.apiTokenEncrypted, SERVICES_SECRET_KEY);
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

      const errorsLine =
        topErrors.length === 0
          ? "✅ No job failures in last 24h"
          : topErrors
              .map((item, idx) => `${idx + 1}. ${escHtml(item.message)} (${item.count})`)
              .join("\n");

      const text =
        `🗓 <b>Admin Daily Digest</b>\n` +
        `Pending requests: <b>${pending}</b>\n` +
        `${serviceLine}\n\n` +
        `<b>Top errors (24h)</b>\n${errorsLine}`;

      await bot.api.sendMessage(admin.telegramId, text, { parse_mode: "HTML" }).catch(() => {});
    }

    await markDigestSentForDate(dateKey);
  });
}

export function startSchedulers(bot: Bot) {
  void sendRequestStatusAndWatchAlerts(bot).catch(() => {});
  void sendAdminDailyDigest(bot).catch(() => {});

  setInterval(() => {
    void sendRequestStatusAndWatchAlerts(bot).catch(() => {});
  }, 60_000);

  setInterval(() => {
    void sendAdminDailyDigest(bot).catch(() => {});
  }, 5 * 60_000);
}
