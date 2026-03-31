import {
  createNotification,
  getTelegramUserByUserId,
  listNotificationEndpointsForUser,
  type NotificationEndpointFull,
  type DiscordConfig,
  type TelegramConfig,
  type EmailConfig,
  type WebhookConfig,
} from "@/db";
import { logger } from "@/lib/logger";
import { sendDiscordWebhook } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";
import { notifyUserPushEvent } from "@/notifications/push-events";
import { deliverWithReliability, NotificationDeliverySkipError } from "@/notifications/reliability";

export type WatchPartyEvent =
  | "watch_party_invite"
  | "watch_party_join_request"
  | "watch_party_join_request_approved"
  | "watch_party_join_request_denied"
  | "watch_party_invite_accepted"
  | "watch_party_started"
  | "watch_party_paused"
  | "watch_party_resumed"
  | "watch_party_ended";

function shouldSend(endpoint: NotificationEndpointFull, event: WatchPartyEvent) {
  if (!endpoint.enabled) return false;
  if (!Array.isArray(endpoint.events) || endpoint.events.length === 0) return true;
  return endpoint.events.includes(event);
}

export async function notifyWatchPartyEvent(input: {
  event: WatchPartyEvent;
  targetUserId: number;
  title: string;
  body: string;
  link: string;
  metadata?: Record<string, unknown>;
}) {
  await createNotification({
    userId: input.targetUserId,
    type: input.event,
    title: input.title,
    message: input.body,
    link: input.link,
    metadata: input.metadata ?? null,
  });

  notifyUserPushEvent(input.targetUserId, {
    title: input.title,
    body: input.body,
    tag: `watch-party-${input.event}-${Date.now()}`,
    url: input.link,
  }).catch(() => {});

  // Send bot DM to user if they have Telegram linked via the LeMedia bot
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    getTelegramUserByUserId(input.targetUserId).then((tgUser) => {
      if (!tgUser?.telegram_id) return;
      const icon =
        input.event === "watch_party_invite" ? "🎉"
        : input.event === "watch_party_join_request" ? "🙋"
        : input.event === "watch_party_join_request_approved" ? "✅"
        : input.event === "watch_party_join_request_denied" ? "❌"
        : input.event === "watch_party_invite_accepted" ? "✅"
        : input.event === "watch_party_started" ? "▶️"
        : input.event === "watch_party_paused" ? "⏸️"
        : input.event === "watch_party_resumed" ? "▶️"
        : "🏁";
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const linkLine = input.link ? `\n<a href="${esc(input.link)}">View in LeMedia →</a>` : "";
      const msg = `${icon} <b>${esc(input.title)}</b>\n${esc(input.body)}${linkLine}`;
      return sendTelegramMessage({ botToken, chatId: tgUser.telegram_id, text: msg, parseMode: "HTML" });
    }).catch((err: Error) => {
      logger.warn("[watch-party] Bot DM failed", { userId: input.targetUserId, error: err?.message });
    });
  }

  const endpoints = await listNotificationEndpointsForUser(input.targetUserId).catch(() => []);
  const eligible = endpoints.filter((endpoint) => shouldSend(endpoint, input.event));

  await Promise.all(
    eligible.map(async (endpoint) => {
      await deliverWithReliability(
        {
          endpointId: endpoint.id,
          endpointType: endpoint.type,
          eventType: input.event,
          targetUserId: input.targetUserId,
          metadata: input.metadata,
        },
        async () => {
          if (endpoint.type === "discord") {
            const config = endpoint.config as DiscordConfig;
            const webhookUrl = String(config?.webhookUrl ?? "");
            if (!webhookUrl) throw new NotificationDeliverySkipError("Discord webhook URL missing");
            await sendDiscordWebhook({
              webhookUrl,
              content: `**${input.title}**\n${input.body}\n${input.link}`,
            });
            return;
          }

          if (endpoint.type === "telegram") {
            const config = endpoint.config as TelegramConfig;
            const botToken = String(config?.botToken ?? "");
            const chatId = String(config?.chatId ?? "");
            if (!botToken || !chatId) throw new NotificationDeliverySkipError("Telegram bot token/chat missing");
            await sendTelegramMessage({
              botToken,
              chatId,
              text: `${input.title}\n${input.body}\n${input.link}`,
            });
            return;
          }

          if (endpoint.type === "email") {
            const config = endpoint.config as EmailConfig;
            const to = String(config?.to ?? "").trim();
            if (!to) throw new NotificationDeliverySkipError("Email recipient missing");
            await sendEmail({
              to,
              subject: `[LeMedia] ${input.title}`,
              text: `${input.body}\n\n${input.link}`,
              smtp: config,
            });
            return;
          }

          if (endpoint.type === "webhook") {
            const config = endpoint.config as WebhookConfig;
            const url = String(config?.url ?? "");
            if (!url) throw new NotificationDeliverySkipError("Webhook URL missing");
            await sendGenericWebhook({
              url,
              body: {
                type: "lemedia.watch_party",
                event: input.event,
                title: input.title,
                message: input.body,
                link: input.link,
                metadata: input.metadata ?? null,
                sentAt: new Date().toISOString(),
              },
            });
            return;
          }

          // Other endpoint types are intentionally skipped for now.
          throw new NotificationDeliverySkipError(`Endpoint type ${endpoint.type} is not supported for watch party events`);
        }
      );
    })
  ).catch((error) => {
    logger.warn("[watch-party] Failed delivering one or more endpoint events", {
      error: error instanceof Error ? error.message : String(error),
      event: input.event,
      targetUserId: input.targetUserId,
    });
  });
}
