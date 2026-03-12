import {
  createNotification,
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
  const due = await listDueFollowedMediaReleaseNotifications(250);
  if (due.length === 0) {
    return "no releases due";
  }

  let delivered = 0;
  let failed = 0;

  for (const item of due) {
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
      for (const endpoint of endpoints) {
        try {
          if (endpoint.type === "telegram") {
            const cfg = endpoint.config as TelegramConfig;
            const botToken = String(cfg?.botToken ?? "").trim();
            const chatId = String(cfg?.chatId ?? "").trim();
            if (!botToken || !chatId) continue;
            await sendTelegramMessage({ botToken, chatId, text: `🎬 ${message.title}\n\n${message.body}` });
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
          }
        } catch (err) {
          logger.warn("[followed-media] endpoint delivery failed", {
            endpointType: endpoint.type,
            userId: item.userId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (item.telegramId && item.telegramFollowOptIn) {
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

  return `due=${due.length} delivered=${delivered} failed=${failed}`;
}
