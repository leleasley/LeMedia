import {
  createNotification,
  hasUserMediaListEntry,
  listDueFollowedMediaReleaseNotifications,
  listNotificationEndpointsForUser,
  markFollowedMediaReleaseNotified,
  type DiscordConfig,
  type EmailConfig,
  type TelegramConfig,
  type WebhookConfig,
} from "@/db";
import { logger } from "@/lib/logger";
import { sendDiscordWebhook } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";
import { getAppTimezone, isValidTimeZone } from "@/lib/app-timezone";

const DEFAULT_RELEASE_TIMEZONE = "Europe/London";

async function getReleaseNotificationsTimezone(): Promise<string> {
  const candidate = String(
    process.env.RELEASE_NOTIFICATIONS_TIMEZONE
      ?? process.env.JOBS_TIMEZONE
      ?? process.env.TZ
      ?? DEFAULT_RELEASE_TIMEZONE
  ).trim();

  if (candidate && isValidTimeZone(candidate)) {
    return candidate;
  }
  return getAppTimezone();
}

function buildReleaseMessage(item: { title: string; mediaType: "movie" | "tv"; releaseType: "theatrical" | "digital" }) {
  if (item.releaseType === "theatrical") {
    if (item.mediaType === "movie") {
      return {
        title: `${item.title} is now in theaters`,
        body: `${item.title} just reached its theatrical release date.`,
      };
    }
    return {
      title: `${item.title} has premiered`,
      body: `${item.title} has reached its premiere date.`,
    };
  }

  return {
    title: `${item.title} digital release is out`,
    body: `${item.title} is now on digital release. Time to grab/request it.`,
  };
}

function appMediaUrl(mediaType: "movie" | "tv", tmdbId: number) {
  return `/${mediaType}/${tmdbId}`;
}

export async function sendFollowedMediaReleaseNotificationsJob(): Promise<string> {
  const timeZone = await getReleaseNotificationsTimezone();
  const due = await listDueFollowedMediaReleaseNotifications(250, timeZone);
  if (due.length === 0) {
    return `no releases due (tz=${timeZone})`;
  }

  let delivered = 0;
  let failed = 0;
  let skippedOverlap = 0;

  for (const item of due) {
    // If a TV title is both "following" and in favorite/watchlist, episode
    // reminders already cover updates. Suppress followed-media release to avoid
    // duplicate alerts for the same title/day.
    if (item.mediaType === "tv" && item.releaseType === "theatrical") {
      const trackedInLists = await hasUserMediaListEntry({
        userId: item.userId,
        mediaType: "tv",
        tmdbId: item.tmdbId,
        listTypes: ["favorite", "watchlist"],
      });
      if (trackedInLists) {
        await markFollowedMediaReleaseNotified(item.id, item.releaseType);
        skippedOverlap += 1;
        continue;
      }
    }

    const message = buildReleaseMessage(item);
    const link = appMediaUrl(item.mediaType, item.tmdbId);

    try {
      await createNotification({
        userId: item.userId,
        type: "followed_media_release",
        title: message.title,
        message: message.body,
        link,
        metadata: {
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          releaseType: item.releaseType,
        },
      });

      const endpoints = await listNotificationEndpointsForUser(item.userId);
      let sentViaTelegramEndpoint = false;
      for (const endpoint of endpoints) {
        try {
          if (endpoint.type === "telegram") {
            const cfg = endpoint.config as TelegramConfig;
            const botToken = String(cfg?.botToken ?? "").trim();
            const chatId = String(cfg?.chatId ?? "").trim();
            if (!botToken || !chatId) continue;
            await sendTelegramMessage({ botToken, chatId, text: `🎬 ${message.title}\n\n${message.body}` });
            sentViaTelegramEndpoint = true;
            continue;
          }

          if (endpoint.type === "discord") {
            const cfg = endpoint.config as DiscordConfig;
            const webhookUrl = String(cfg?.webhookUrl ?? "").trim();
            if (!webhookUrl) continue;
            await sendDiscordWebhook({
              webhookUrl,
              content: `🎬 **${message.title}**\n${message.body}`,
            });
            continue;
          }

          if (endpoint.type === "email") {
            const cfg = endpoint.config as EmailConfig;
            const to = String(cfg?.to ?? "").trim();
            if (!to) continue;
            await sendEmail({
              to,
              subject: `[LeMedia] ${message.title}`,
              text: `${message.body}\n\nOpen: ${link}`,
              html: `<p>${message.body}</p><p><a href="${link}">Open in LeMedia</a></p>`,
              smtp: cfg,
            });
            continue;
          }

          if (endpoint.type === "webhook") {
            const cfg = endpoint.config as WebhookConfig;
            const url = String(cfg?.url ?? "").trim();
            if (!url) continue;
            await sendGenericWebhook({
              url,
              body: {
                event: "followed_media_release",
                title: message.title,
                message: message.body,
                mediaType: item.mediaType,
                tmdbId: item.tmdbId,
                releaseType: item.releaseType,
              },
            });
            continue;
          }

          if (endpoint.type === "slack") {
            const webhookUrl = String((endpoint.config as any)?.webhookUrl ?? "").trim();
            if (!webhookUrl) continue;
            const res = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `[LeMedia] ${message.title}`,
                blocks: [{ type: "section", text: { type: "mrkdwn", text: `${message.body}\n${link}` } }],
              }),
            });
            if (!res.ok) throw new Error(`Slack webhook failed: HTTP ${res.status}`);
            continue;
          }

          if (endpoint.type === "gotify") {
            const baseUrl = String((endpoint.config as any)?.baseUrl ?? "").replace(/\/+$/, "");
            const token = String((endpoint.config as any)?.token ?? "").trim();
            if (!baseUrl || !token) continue;
            const res = await fetch(`${baseUrl}/message?token=${encodeURIComponent(token)}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: message.title,
                message: `${message.body}\n${link}`,
                priority: 8,
              }),
            });
            if (!res.ok) throw new Error(`Gotify request failed: HTTP ${res.status}`);
            continue;
          }

          if (endpoint.type === "ntfy") {
            const topic = String((endpoint.config as any)?.topic ?? "").trim();
            const baseUrl = String((endpoint.config as any)?.baseUrl ?? "https://ntfy.sh").replace(/\/+$/, "");
            if (!topic) continue;
            const res = await fetch(`${baseUrl}/${encodeURIComponent(topic)}`, {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: `${message.title}\n\n${message.body}\n${link}`,
            });
            if (!res.ok) throw new Error(`ntfy request failed: HTTP ${res.status}`);
            continue;
          }

          if (endpoint.type === "pushbullet") {
            const accessToken = String((endpoint.config as any)?.accessToken ?? "").trim();
            if (!accessToken) continue;
            const res = await fetch("https://api.pushbullet.com/v2/pushes", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Access-Token": accessToken,
              },
              body: JSON.stringify({
                type: "note",
                title: message.title,
                body: `${message.body}\n${link}`,
              }),
            });
            if (!res.ok) throw new Error(`Pushbullet request failed: HTTP ${res.status}`);
            continue;
          }

          if (endpoint.type === "pushover") {
            const apiToken = String((endpoint.config as any)?.apiToken ?? "").trim();
            const userKey = String((endpoint.config as any)?.userKey ?? "").trim();
            if (!apiToken || !userKey) continue;
            const params = new URLSearchParams({
              token: apiToken,
              user: userKey,
              title: message.title,
              message: `${message.body}\n${link}`,
            });
            const res = await fetch("https://api.pushover.net/1/messages.json", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: params.toString(),
            });
            if (!res.ok) throw new Error(`Pushover request failed: HTTP ${res.status}`);
          }
        } catch (err) {
          logger.warn("[followed-media] endpoint delivery failed", {
            endpointType: endpoint.type,
            userId: item.userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (item.telegramId && item.telegramFollowOptIn && !sentViaTelegramEndpoint) {
        const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
        if (botToken) {
          try {
            await sendTelegramMessage({
              botToken,
              chatId: item.telegramId,
              text: `🔔 ${message.title}\n\n${message.body}`,
            });
          } catch (err) {
            logger.warn("[followed-media] direct bot dm failed", {
              userId: item.userId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      await markFollowedMediaReleaseNotified(item.id, item.releaseType);
      delivered++;
    } catch (err) {
      failed++;
      logger.error("[followed-media] release notification failed", {
        followedMediaId: item.id,
        releaseType: item.releaseType,
        userId: item.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return `due=${due.length} delivered=${delivered} failed=${failed} skippedOverlap=${skippedOverlap} tz=${timeZone}`;
}
