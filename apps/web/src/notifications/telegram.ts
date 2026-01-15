import { z } from "zod";

const BotTokenSchema = z.string().trim().min(1);
const ChatIdSchema = z.string().trim().min(1);

export async function sendTelegramMessage(input: { botToken: string; chatId: string; text: string }) {
  const botToken = BotTokenSchema.parse(input.botToken);
  const chatId = ChatIdSchema.parse(input.chatId);
  const text = z.string().min(1).parse(input.text);

  const url = `https://api.telegram.org/bot${encodeURIComponent(botToken)}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: ${res.status} ${res.statusText}${body ? ` - ${body.slice(0, 200)}` : ""}`);
  }
}

