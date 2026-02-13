import {
  listGlobalNotificationEndpointsFull,
  listNotificationEndpointsForUser,
  NotificationEndpointFull,
  type DiscordConfig,
  type TelegramConfig,
  type EmailConfig,
  type WebhookConfig
} from "@/db";
import { DiscordEmbed, sendDiscordWebhook } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";
import { logger } from "@/lib/logger";
import { getNotificationTypeMaskForSystemEvent } from "@/lib/notification-type-bits";

export type SystemAlertEvent =
  | "system_alert_high_latency"
  | "system_alert_service_unreachable"
  | "system_alert_indexers_unavailable";

export type SystemAlertContext = {
  title: string;
  serviceName?: string;
  serviceType?: string;
  latencyMs?: number;
  thresholdMs?: number;
  details?: string;
  metadata?: Record<string, unknown>;
};

export type SystemAlertDelivery = {
  includeGlobalEndpoints?: boolean;
  userIds?: number[];
  ignoreEventFilters?: boolean;
};

const DISCORD_COLORS = {
  WARNING: 15105570,
  CRITICAL: 15158332
};

function shouldSend(endpoint: NotificationEndpointFull, event: SystemAlertEvent): boolean {
  if (!endpoint.enabled) return false;
  const mask = getNotificationTypeMaskForSystemEvent(event);
  if (typeof endpoint.types === "number" && endpoint.types > 0 && mask > 0) {
    return (endpoint.types & mask) === mask;
  }
  if (!Array.isArray(endpoint.events) || endpoint.events.length === 0) return false;
  return endpoint.events.includes(event);
}

function shouldSendWithOptions(
  endpoint: NotificationEndpointFull,
  event: SystemAlertEvent,
  options?: SystemAlertDelivery
) {
  if (options?.ignoreEventFilters) return endpoint.enabled;
  return shouldSend(endpoint, event);
}

function dedupe(endpoints: NotificationEndpointFull[]) {
  const seen = new Set<number>();
  const out: NotificationEndpointFull[] = [];
  for (const endpoint of endpoints) {
    if (seen.has(endpoint.id)) continue;
    seen.add(endpoint.id);
    out.push(endpoint);
  }
  return out;
}

function eventLabel(event: SystemAlertEvent): string {
  switch (event) {
    case "system_alert_high_latency":
      return "High Latency";
    case "system_alert_service_unreachable":
      return "Service Unreachable";
    case "system_alert_indexers_unavailable":
      return "Indexers Unavailable";
  }
}

function buildDiscordEmbed(event: SystemAlertEvent, ctx: SystemAlertContext): DiscordEmbed {
  const fields = [
    { name: "Alert", value: eventLabel(event), inline: true },
    { name: "Service", value: ctx.serviceName ?? "System", inline: true }
  ];

  if (typeof ctx.latencyMs === "number") {
    fields.push({ name: "Latency", value: `${ctx.latencyMs} ms`, inline: true });
  }
  if (typeof ctx.thresholdMs === "number") {
    fields.push({ name: "Threshold", value: `${ctx.thresholdMs} ms`, inline: true });
  }

  return {
    title: ctx.title,
    description: ctx.details,
    color: event === "system_alert_high_latency" ? DISCORD_COLORS.WARNING : DISCORD_COLORS.CRITICAL,
    timestamp: new Date().toISOString(),
    author: { name: "LeMedia System Alerts" },
    fields
  };
}

export async function notifySystemAlertEvent(event: SystemAlertEvent, ctx: SystemAlertContext) {
  return notifySystemAlertEventWithDelivery(event, ctx, undefined);
}

export async function notifySystemAlertEventWithDelivery(
  event: SystemAlertEvent,
  ctx: SystemAlertContext,
  delivery?: SystemAlertDelivery
) {
  const enabled = (process.env.NOTIFICATIONS_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled) return { eligible: 0, delivered: 0 };

  const includeGlobal = delivery?.includeGlobalEndpoints !== false;
  const userIds = Array.isArray(delivery?.userIds) ? delivery!.userIds!.filter((id) => Number.isFinite(id) && id > 0) : [];
  const [globalEndpoints, userEndpoints] = await Promise.all([
    includeGlobal ? listGlobalNotificationEndpointsFull() : Promise.resolve([]),
    userIds.length
      ? Promise.all(userIds.map((userId) => listNotificationEndpointsForUser(userId))).then((groups) => groups.flat())
      : Promise.resolve([])
  ]);

  const endpoints = dedupe([...globalEndpoints, ...userEndpoints]).filter((endpoint) =>
    shouldSendWithOptions(endpoint, event, delivery)
  );
  if (endpoints.length === 0) return { eligible: 0, delivered: 0 };

  const summary = [
    `[${eventLabel(event)}] ${ctx.title}`,
    ctx.serviceName ? `Service: ${ctx.serviceName}${ctx.serviceType ? ` (${ctx.serviceType})` : ""}` : "",
    typeof ctx.latencyMs === "number" ? `Latency: ${ctx.latencyMs} ms` : "",
    typeof ctx.thresholdMs === "number" ? `Threshold: ${ctx.thresholdMs} ms` : "",
    ctx.details ?? ""
  ]
    .filter(Boolean)
    .join("\n");

  const emailSubject = `[LeMedia] System alert: ${eventLabel(event)}${ctx.serviceName ? ` (${ctx.serviceName})` : ""}`;
  const webhookPayload = {
    type: "lemedia.system_alert",
    event,
    title: ctx.title,
    service_name: ctx.serviceName ?? null,
    service_type: ctx.serviceType ?? null,
    latency_ms: typeof ctx.latencyMs === "number" ? ctx.latencyMs : null,
    threshold_ms: typeof ctx.thresholdMs === "number" ? ctx.thresholdMs : null,
    details: ctx.details ?? null,
    metadata: ctx.metadata ?? {},
    sent_at: new Date().toISOString()
  };
  const embed = buildDiscordEmbed(event, ctx);
  let delivered = 0;

  await Promise.all(
    endpoints.map(async (endpoint) => {
      const endpointType = String((endpoint as any)?.type ?? "");
      const configAny = (endpoint as any)?.config ?? {};
      try {
        if (endpointType === "discord") {
          const config = configAny as DiscordConfig;
          const webhookUrl = String(config?.webhookUrl ?? "");
          await sendDiscordWebhook({ webhookUrl, embeds: [embed] });
          delivered += 1;
          return;
        }
        if (endpointType === "telegram") {
          const config = configAny as TelegramConfig;
          const botToken = String(config?.botToken ?? "");
          const chatId = String(config?.chatId ?? "");
          await sendTelegramMessage({ botToken, chatId, text: summary });
          delivered += 1;
          return;
        }
        if (endpointType === "email") {
          const config = configAny as EmailConfig;
          const to = String(config?.to ?? "").trim();
          if (!to) return;
          await sendEmail({ to, subject: emailSubject, text: summary, smtp: config });
          delivered += 1;
          return;
        }
        if (endpointType === "webhook") {
          const config = configAny as WebhookConfig;
          const url = String(config?.url ?? "");
          await sendGenericWebhook({ url, body: webhookPayload });
          delivered += 1;
          return;
        }
        if (endpointType === "slack") {
          const webhookUrl = String(configAny?.webhookUrl ?? "");
          if (!webhookUrl) return;
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `[LeMedia] ${ctx.title}`,
              blocks: [{ type: "section", text: { type: "mrkdwn", text: summary } }]
            })
          });
          if (!res.ok) throw new Error(`Slack webhook failed: HTTP ${res.status}`);
          delivered += 1;
          return;
        }
        if (endpointType === "gotify") {
          const baseUrl = String(configAny?.baseUrl ?? "").replace(/\/+$/, "");
          const token = String(configAny?.token ?? "");
          if (!baseUrl || !token) return;
          const res = await fetch(`${baseUrl}/message?token=${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: ctx.title,
              message: summary,
              priority: 8
            })
          });
          if (!res.ok) throw new Error(`Gotify request failed: HTTP ${res.status}`);
          delivered += 1;
          return;
        }
        if (endpointType === "ntfy") {
          const topic = String(configAny?.topic ?? "");
          const baseUrl = String(configAny?.baseUrl ?? "https://ntfy.sh").replace(/\/+$/, "");
          if (!topic) return;
          const res = await fetch(`${baseUrl}/${encodeURIComponent(topic)}`, {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: summary
          });
          if (!res.ok) throw new Error(`ntfy request failed: HTTP ${res.status}`);
          delivered += 1;
          return;
        }
        if (endpointType === "pushbullet") {
          const accessToken = String(configAny?.accessToken ?? "");
          if (!accessToken) return;
          const res = await fetch("https://api.pushbullet.com/v2/pushes", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Access-Token": accessToken
            },
            body: JSON.stringify({
              type: "note",
              title: ctx.title,
              body: summary
            })
          });
          if (!res.ok) throw new Error(`Pushbullet request failed: HTTP ${res.status}`);
          delivered += 1;
          return;
        }
        if (endpointType === "pushover") {
          const apiToken = String(configAny?.apiToken ?? "");
          const userKey = String(configAny?.userKey ?? "");
          if (!apiToken || !userKey) return;
          const params = new URLSearchParams({
            token: apiToken,
            user: userKey,
            title: ctx.title,
            message: summary
          });
          const res = await fetch("https://api.pushover.net/1/messages.json", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: params.toString()
          });
          if (!res.ok) throw new Error(`Pushover request failed: HTTP ${res.status}`);
          delivered += 1;
          return;
        }
      } catch (err) {
        logger.error(`[notify] system alert failed endpoint=${endpoint.id} type=${endpointType}`, err);
      }
    })
  );
  return { eligible: endpoints.length, delivered };
}
