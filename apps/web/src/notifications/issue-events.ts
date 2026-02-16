import {
  listGlobalNotificationEndpointsFull,
  listNotificationEndpointsForUser,
  NotificationEndpointFull,
  getUserById,
  type DiscordConfig,
  type TelegramConfig,
  type EmailConfig,
  type WebhookConfig
} from "@/db";
import { DiscordEmbed, sendDiscordWebhook } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";
import { deliverWithReliability, NotificationDeliverySkipError } from "@/notifications/reliability";

export type IssueNotificationEvent = "issue_reported" | "issue_resolved";

export type IssueNotificationContext = {
  issueId: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  category: string;
  description: string;
  username: string;
  userId?: number;
  imageUrl?: string | null;
  url?: string | null;
};

const DISCORD_COLORS = {
  ORANGE: 15105570,
  GREEN: 3066993,
  RED: 15158332
};

function clampText(value: string | null | undefined, max = 2000) {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function issueEventLabel(event: IssueNotificationEvent) {
  switch (event) {
    case "issue_reported":
      return "Issue Reported";
    case "issue_resolved":
      return "Issue Resolved";
  }
}

function issueStatusLabel(event: IssueNotificationEvent) {
  return event === "issue_resolved" ? "Resolved" : "Open";
}

function issueColor(event: IssueNotificationEvent) {
  return event === "issue_resolved" ? DISCORD_COLORS.GREEN : DISCORD_COLORS.RED;
}

function buildIssueDiscordEmbed(
  event: IssueNotificationEvent,
  ctx: IssueNotificationContext
): DiscordEmbed {
  const fields = [
    { name: "Reported By", value: ctx.username, inline: true },
    { name: "Issue Type", value: ctx.category, inline: true },
    { name: "Issue Status", value: issueStatusLabel(event), inline: true }
  ];

  return {
    title: `${issueEventLabel(event)}: ${ctx.title}`,
    description: clampText(ctx.description),
    url: ctx.url ?? undefined,
    color: issueColor(event),
    timestamp: new Date().toISOString(),
    author: { name: issueEventLabel(event) },
    fields,
    thumbnail: ctx.imageUrl ? { url: ctx.imageUrl } : undefined
  };
}

function shouldSend(endpoint: NotificationEndpointFull, event: IssueNotificationEvent): boolean {
  if (!endpoint.enabled) return false;
  if (!Array.isArray(endpoint.events) || endpoint.events.length === 0) return true;
  return endpoint.events.includes(event);
}

function dedupe(endpoints: NotificationEndpointFull[]): NotificationEndpointFull[] {
  const seen = new Set<number>();
  const out: NotificationEndpointFull[] = [];
  for (const e of endpoints) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export async function notifyIssueEvent(event: IssueNotificationEvent, ctx: IssueNotificationContext) {
  const enabled = (process.env.NOTIFICATIONS_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled) return;

  const includeGlobal = event === "issue_reported";
  const [globalEndpoints, userEndpoints] = await Promise.all([
    includeGlobal ? listGlobalNotificationEndpointsFull() : Promise.resolve([]),
    ctx.userId ? listNotificationEndpointsForUser(ctx.userId) : Promise.resolve([])
  ]);

  const endpoints = dedupe([...globalEndpoints, ...userEndpoints]).filter(e => shouldSend(e, event));
  if (endpoints.length === 0) return;

  const userEmail =
    ctx.userId && Number.isFinite(ctx.userId) ? (await getUserById(ctx.userId))?.email ?? null : null;

  const headline = event === "issue_resolved" ? `Issue resolved: ${ctx.title}` : `Issue reported: ${ctx.title}`;
  const meta = `${ctx.mediaType.toUpperCase()} • TMDB ${ctx.tmdbId}`;
  const plain = [
    headline,
    meta,
    `Category: ${ctx.category}`,
    ctx.description ? `Details: ${ctx.description}` : "",
    `Reported by: ${ctx.username}`,
    ctx.url ?? ""
  ]
    .filter(Boolean)
    .join("\n");

  const payload = {
    type: event === "issue_resolved" ? "lemedia.issue_resolved" : "lemedia.issue_reported",
    event,
    issue_id: ctx.issueId,
    media_type: ctx.mediaType,
    tmdb_id: ctx.tmdbId,
    title: ctx.title,
    category: ctx.category,
    description: ctx.description,
    reported_by: { username: ctx.username, user_id: ctx.userId },
    image_url: ctx.imageUrl,
    url: ctx.url,
    sent_at: new Date().toISOString()
  };
  const discordEmbed = buildIssueDiscordEmbed(event, ctx);

  await Promise.all(
    endpoints.map(async endpoint => {
      await deliverWithReliability(
        {
          endpointId: endpoint.id,
          endpointType: endpoint.type,
          eventType: event,
          targetUserId: ctx.userId ?? null,
          metadata: { issueId: ctx.issueId, tmdbId: ctx.tmdbId, mediaType: ctx.mediaType }
        },
        async () => {
          if (endpoint.type === "discord") {
            const config = endpoint.config as DiscordConfig;
            const webhookUrl = String(config?.webhookUrl ?? "");
            if (!webhookUrl) throw new NotificationDeliverySkipError("Discord webhook URL is not configured");
            await sendDiscordWebhook({ webhookUrl, embeds: [discordEmbed] });
            return;
          }
          if (endpoint.type === "telegram") {
            const config = endpoint.config as TelegramConfig;
            const botToken = String(config?.botToken ?? "");
            const chatId = String(config?.chatId ?? "");
            if (!botToken || !chatId) throw new NotificationDeliverySkipError("Telegram bot token or chat ID missing");
            await sendTelegramMessage({ botToken, chatId, text: plain });
            return;
          }
          if (endpoint.type === "email") {
            const config = endpoint.config as EmailConfig;
            const configuredTo = String(config?.to ?? "").trim();
            if (!configuredTo && config?.userEmailRequired && !userEmail) {
              throw new NotificationDeliverySkipError("Endpoint requires user email, but user has no email");
            }
            const to = configuredTo || String(userEmail ?? "").trim();
            if (!to) throw new NotificationDeliverySkipError("No recipient email configured");
            await sendEmail({ to, subject: "[LeMedia] Issue reported", text: plain, smtp: config });
            return;
          }
          if (endpoint.type === "webhook") {
            const config = endpoint.config as WebhookConfig;
            const url = String(config?.url ?? "");
            if (!url) throw new NotificationDeliverySkipError("Webhook URL is not configured");
            await sendGenericWebhook({ url, body: payload });
            return;
          }
          throw new NotificationDeliverySkipError(`Unsupported endpoint type for issue events: ${endpoint.type}`);
        }
      );
    })
  );
}
