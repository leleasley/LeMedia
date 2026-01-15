import { z } from "zod";

const DiscordWebhookUrlSchema = z
  .string()
  .url()
  .refine(url => {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      const isDiscordHost =
        host === "discord.com" ||
        host === "discordapp.com" ||
        host === "canary.discord.com" ||
        host === "ptb.discord.com";
      if (!isDiscordHost) return false;
      return /^\/api\/webhooks\/\d+\/[^/]+/.test(u.pathname);
    } catch {
      return false;
    }
  }, "Discord webhook URL must be a valid discord.com /api/webhooks/... URL");

export type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type DiscordEmbed = {
  title?: string;
  type?: "rich";
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string };
  image?: { url?: string };
  thumbnail?: { url?: string };
  author?: { name?: string; url?: string; icon_url?: string };
  fields?: DiscordEmbedField[];
};

export type DiscordWebhookInput = {
  webhookUrl: string;
  content?: string;
  embeds?: DiscordEmbed[];
  username?: string;
  avatarUrl?: string;
  tts?: boolean;
  allowedMentions?: {
    parse?: Array<"users" | "roles" | "everyone">;
    roles?: string[];
    users?: string[];
  };
};

export async function sendDiscordWebhook(input: DiscordWebhookInput) {
  const webhookUrl = DiscordWebhookUrlSchema.parse(input.webhookUrl);
  const payload = {
    content: input.content ?? "",
    embeds: input.embeds ?? [],
    username: input.username,
    avatar_url: input.avatarUrl,
    tts: input.tts ?? false,
    allowed_mentions: input.allowedMentions
  };
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord webhook failed: ${res.status} ${res.statusText}${text ? ` - ${text.slice(0, 200)}` : ""}`);
  }
}
