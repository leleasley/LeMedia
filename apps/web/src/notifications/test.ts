import { NotificationEndpointFull } from "@/db";
import { sendDiscordWebhook } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";

function nowIso() {
  return new Date().toISOString();
}

export async function sendTestNotification(endpoint: NotificationEndpointFull) {
  const base = process.env.APP_BASE_URL?.trim()?.replace(/\/+$/, "");
  const where = base ? `${base}` : "(no APP_BASE_URL set)";
  const text = `LeMedia test notification\nTime: ${nowIso()}\nEndpoint: ${endpoint.name} (${endpoint.type})\nFrom: ${where}`;

  if (endpoint.type === "discord") {
    const webhookUrl = String(endpoint.config?.webhookUrl ?? "");
    await sendDiscordWebhook({ webhookUrl, content: `**LeMedia test notification**\n${text.replace(/\n/g, "\n")}` });
    return;
  }

  if (endpoint.type === "telegram") {
    const botToken = String(endpoint.config?.botToken ?? "");
    const chatId = String(endpoint.config?.chatId ?? "");
    await sendTelegramMessage({ botToken, chatId, text });
    return;
  }

  if (endpoint.type === "email") {
    const to = String(endpoint.config?.to ?? "");
    await sendEmail({ to, subject: "[LeMedia] Test notification", text });
    return;
  }

  if (endpoint.type === "webhook") {
    const url = String(endpoint.config?.url ?? "");
    await sendGenericWebhook({
      url,
      body: {
        type: "lemedia.test",
        sent_at: nowIso(),
        message: text
      }
    });
    return;
  }

  const exhaustive: never = endpoint.type;
  throw new Error(`Unsupported endpoint type: ${exhaustive}`);
}

