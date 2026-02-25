import { Bot } from "grammy";
import {
  completeWatchAlert,
  getRequestStatusState,
  listLinkedRequestStatuses,
  listTriggeredWatchAlerts,
  upsertRequestStatusState,
  withAdvisoryLock,
} from "./db";

const APP_BASE_URL = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");

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

export function startSchedulers(bot: Bot) {
  void sendRequestStatusAndWatchAlerts(bot).catch(() => {});

  setInterval(() => {
    void sendRequestStatusAndWatchAlerts(bot).catch(() => {});
  }, 60_000);
}
