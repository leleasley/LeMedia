import {
  getNotificationEndpointByIdFull,
  NotificationEndpointFull,
  type DiscordConfig,
  type TelegramConfig,
  type EmailConfig,
  type WebhookConfig,
} from "@/db";
import { DiscordEmbed, sendDiscordWebhook } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";
import { logger } from "@/lib/logger";
import { getSecurityAlertsConfig } from "@/lib/security-alerts-config";
import {
  deliverWithReliability,
  NotificationDeliverySkipError,
} from "@/notifications/reliability";

export type SecurityAlertEvent =
  | "security_login_failure"
  | "security_mfa_failure"
  | "security_new_user";

export type SecurityAlertContext = {
  title: string;
  username?: string;
  ip?: string;
  details?: string;
  metadata?: Record<string, unknown>;
};

const DISCORD_COLOR_SECURITY = 15158332; // red

function eventLabel(event: SecurityAlertEvent): string {
  switch (event) {
    case "security_login_failure":
      return "Login Failure";
    case "security_mfa_failure":
      return "MFA Failure";
    case "security_new_user":
      return "New User Registered";
  }
}

function buildDiscordEmbed(
  event: SecurityAlertEvent,
  ctx: SecurityAlertContext
): DiscordEmbed {
  const fields = [
    { name: "Alert", value: eventLabel(event), inline: true },
  ];
  if (ctx.username) {
    fields.push({ name: "User", value: ctx.username, inline: true });
  }
  if (ctx.ip) {
    fields.push({ name: "IP", value: ctx.ip, inline: true });
  }

  return {
    title: ctx.title,
    description: ctx.details,
    color: DISCORD_COLOR_SECURITY,
    timestamp: new Date().toISOString(),
    author: { name: "LeMedia Security Alerts" },
    fields,
  };
}

async function deliverToEndpoint(
  endpoint: NotificationEndpointFull,
  event: SecurityAlertEvent,
  ctx: SecurityAlertContext
) {
  const endpointType = String((endpoint as any)?.type ?? "");
  const configAny = (endpoint as any)?.config ?? {};

  const summary = [
    `[Security Alert: ${eventLabel(event)}] ${ctx.title}`,
    ctx.username ? `User: ${ctx.username}` : "",
    ctx.ip ? `IP: ${ctx.ip}` : "",
    ctx.details ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const emailSubject = `[LeMedia] Security alert: ${eventLabel(event)}`;
  const webhookPayload = {
    type: "lemedia.security_alert",
    event,
    title: ctx.title,
    username: ctx.username ?? null,
    ip: ctx.ip ?? null,
    details: ctx.details ?? null,
    metadata: ctx.metadata ?? {},
    sent_at: new Date().toISOString(),
  };
  const embed = buildDiscordEmbed(event, ctx);

  const result = await deliverWithReliability(
    {
      endpointId: endpoint.id,
      endpointType,
      eventType: event,
      metadata: {
        title: ctx.title,
        username: ctx.username ?? null,
        ip: ctx.ip ?? null,
      },
    },
    async () => {
      if (endpointType === "discord") {
        const config = configAny as DiscordConfig;
        const webhookUrl = String(config?.webhookUrl ?? "");
        if (!webhookUrl)
          throw new NotificationDeliverySkipError("Discord webhook URL is not configured");
        await sendDiscordWebhook({ webhookUrl, embeds: [embed] });
        return;
      }
      if (endpointType === "telegram") {
        const config = configAny as TelegramConfig;
        const botToken = String(config?.botToken ?? "");
        const chatId = String(config?.chatId ?? "");
        if (!botToken || !chatId)
          throw new NotificationDeliverySkipError("Telegram bot token or chat ID missing");
        await sendTelegramMessage({ botToken, chatId, text: summary });
        return;
      }
      if (endpointType === "email") {
        const config = configAny as EmailConfig;
        const to = String(config?.to ?? "").trim();
        if (!to)
          throw new NotificationDeliverySkipError("No recipient email configured");
        await sendEmail({ to, subject: emailSubject, text: summary, smtp: config });
        return;
      }
      if (endpointType === "webhook") {
        const config = configAny as WebhookConfig;
        const url = String(config?.url ?? "");
        if (!url)
          throw new NotificationDeliverySkipError("Webhook URL is not configured");
        await sendGenericWebhook({ url, body: webhookPayload });
        return;
      }
      if (endpointType === "slack") {
        const webhookUrl = String(configAny?.webhookUrl ?? "");
        if (!webhookUrl)
          throw new NotificationDeliverySkipError("Slack webhook URL is not configured");
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `[LeMedia Security] ${ctx.title}`,
            blocks: [{ type: "section", text: { type: "mrkdwn", text: summary } }],
          }),
        });
        if (!res.ok) throw new Error(`Slack webhook failed: HTTP ${res.status}`);
        return;
      }
      if (endpointType === "gotify") {
        const baseUrl = String(configAny?.baseUrl ?? "").replace(/\/+$/, "");
        const token = String(configAny?.token ?? "");
        if (!baseUrl || !token)
          throw new NotificationDeliverySkipError("Gotify base URL or token missing");
        const res = await fetch(`${baseUrl}/message?token=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: ctx.title, message: summary, priority: 10 }),
        });
        if (!res.ok) throw new Error(`Gotify request failed: HTTP ${res.status}`);
        return;
      }
      if (endpointType === "ntfy") {
        const topic = String(configAny?.topic ?? "");
        const baseUrl = String(configAny?.baseUrl ?? "https://ntfy.sh").replace(/\/+$/, "");
        if (!topic)
          throw new NotificationDeliverySkipError("ntfy topic is not configured");
        const res = await fetch(`${baseUrl}/${encodeURIComponent(topic)}`, {
          method: "POST",
          headers: { "Content-Type": "text/plain", Priority: "urgent" },
          body: summary,
        });
        if (!res.ok) throw new Error(`ntfy request failed: HTTP ${res.status}`);
        return;
      }
      if (endpointType === "pushbullet") {
        const accessToken = String(configAny?.accessToken ?? "");
        if (!accessToken)
          throw new NotificationDeliverySkipError("Pushbullet access token is not configured");
        const res = await fetch("https://api.pushbullet.com/v2/pushes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Access-Token": accessToken,
          },
          body: JSON.stringify({ type: "note", title: ctx.title, body: summary }),
        });
        if (!res.ok) throw new Error(`Pushbullet request failed: HTTP ${res.status}`);
        return;
      }
      if (endpointType === "pushover") {
        const apiToken = String(configAny?.apiToken ?? "");
        const userKey = String(configAny?.userKey ?? "");
        if (!apiToken || !userKey)
          throw new NotificationDeliverySkipError("Pushover token or user key missing");
        const params = new URLSearchParams({
          token: apiToken,
          user: userKey,
          title: ctx.title,
          message: summary,
          priority: "1",
        });
        const res = await fetch("https://api.pushover.net/1/messages.json", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        if (!res.ok) throw new Error(`Pushover request failed: HTTP ${res.status}`);
        return;
      }
      throw new NotificationDeliverySkipError(
        `Unsupported endpoint type for security alerts: ${endpointType}`
      );
    }
  );

  return result;
}

export async function notifySecurityAlertEvent(
  event: SecurityAlertEvent,
  ctx: SecurityAlertContext
): Promise<{ eligible: number; delivered: number }> {
  const notificationsEnabled =
    (process.env.NOTIFICATIONS_ENABLED ?? "true").toLowerCase() !== "false";
  if (!notificationsEnabled) return { eligible: 0, delivered: 0 };

  const config = await getSecurityAlertsConfig();
  if (!config.enabled) return { eligible: 0, delivered: 0 };

  const eventEnabled =
    (event === "security_login_failure" && config.loginFailureEnabled) ||
    (event === "security_mfa_failure" && config.mfaFailureEnabled) ||
    (event === "security_new_user" && config.newUserEnabled);

  if (!eventEnabled) return { eligible: 0, delivered: 0 };
  if (config.endpointIds.length === 0) return { eligible: 0, delivered: 0 };

  const endpointResults = await Promise.all(
    config.endpointIds.map((id) => getNotificationEndpointByIdFull(id))
  );
  const endpoints = endpointResults.filter(
    (ep): ep is NotificationEndpointFull => ep != null && (ep as any).enabled === true
  );

  if (endpoints.length === 0) return { eligible: 0, delivered: 0 };

  let delivered = 0;
  await Promise.all(
    endpoints.map(async (endpoint) => {
      try {
        const result = await deliverToEndpoint(endpoint, event, ctx);
        if (result.status === "success") delivered += 1;
      } catch (err) {
        logger.warn(`[Security Alerts] delivery failed for endpoint ${endpoint.id}`, { err });
      }
    })
  );

  return { eligible: endpoints.length, delivered };
}
