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

  if (endpoint.type === "slack") {
    const webhookUrl = String(endpoint.config?.webhookUrl ?? "");
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `[LeMedia] Test notification`,
        blocks: [{ type: "section", text: { type: "mrkdwn", text } }],
      }),
    });
    if (!res.ok) throw new Error(`Slack webhook failed: HTTP ${res.status}`);
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

  if (endpoint.type === "gotify") {
    const baseUrl = String(endpoint.config?.baseUrl ?? "").replace(/\/+$/, "");
    const token = String(endpoint.config?.token ?? "");
    const res = await fetch(`${baseUrl}/message?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "LeMedia test notification", message: text, priority: 8 }),
    });
    if (!res.ok) throw new Error(`Gotify request failed: HTTP ${res.status}`);
    return;
  }

  if (endpoint.type === "ntfy") {
    const topic = String(endpoint.config?.topic ?? "");
    const baseUrl = String(endpoint.config?.baseUrl ?? "https://ntfy.sh").replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: text,
    });
    if (!res.ok) throw new Error(`ntfy request failed: HTTP ${res.status}`);
    return;
  }

  if (endpoint.type === "pushbullet") {
    const accessToken = String(endpoint.config?.accessToken ?? "");
    const res = await fetch("https://api.pushbullet.com/v2/pushes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify({ type: "note", title: "LeMedia test notification", body: text }),
    });
    if (!res.ok) throw new Error(`Pushbullet request failed: HTTP ${res.status}`);
    return;
  }

  if (endpoint.type === "pushover") {
    const apiToken = String(endpoint.config?.apiToken ?? "");
    const userKey = String(endpoint.config?.userKey ?? "");
    const params = new URLSearchParams({
      token: apiToken,
      user: userKey,
      title: "LeMedia test notification",
      message: text,
    });
    const res = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!res.ok) throw new Error(`Pushover request failed: HTTP ${res.status}`);
    return;
  }

  const exhaustive: never = endpoint;
  throw new Error(`Unsupported endpoint type: ${(exhaustive as { type: string }).type}`);
}

