import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  addUserNotificationEndpointId,
  createNotificationEndpoint,
  listNotificationEndpointsForOwner,
  NotificationEndpointType,
  upsertUser,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

const typeSchema = z.enum([
  "telegram",
  "discord",
  "email",
  "webhook",
  "slack",
  "gotify",
  "ntfy",
  "pushbullet",
  "pushover",
]);

function isValidDiscordWebhookUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isDiscordHost =
      host === "discord.com" ||
      host === "discordapp.com" ||
      host === "canary.discord.com" ||
      host === "ptb.discord.com";
    if (!isDiscordHost) return false;
    return /^\/api\/webhooks\/\d+\/[^/]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}

const baseSchema = z.object({
  name: z.string().trim().min(1),
  type: typeSchema,
  enabled: z.boolean().optional(),
  events: z.array(z.string().trim().min(1)).optional(),
});

const telegramSchema = baseSchema.extend({
  type: z.literal("telegram"),
  botToken: z.string().trim().min(1),
  chatId: z.string().trim().min(1),
});

const discordSchema = baseSchema.extend({
  type: z.literal("discord"),
  webhookUrl: z
    .string()
    .trim()
    .url()
    .refine(isValidDiscordWebhookUrl, "Discord webhook URL must be a valid discord.com /api/webhooks/... URL"),
});

const slackSchema = baseSchema.extend({
  type: z.literal("slack"),
  webhookUrl: z.string().trim().url(),
});

const gotifySchema = baseSchema.extend({
  type: z.literal("gotify"),
  baseUrl: z.string().trim().url(),
  token: z.string().trim().min(1),
});

const ntfySchema = baseSchema.extend({
  type: z.literal("ntfy"),
  topic: z.string().trim().min(1),
  baseUrl: z.string().trim().url().optional(),
});

const pushbulletSchema = baseSchema.extend({
  type: z.literal("pushbullet"),
  accessToken: z.string().trim().min(1),
});

const pushoverSchema = baseSchema.extend({
  type: z.literal("pushover"),
  apiToken: z.string().trim().min(1),
  userKey: z.string().trim().min(1),
});

const emailSchema = baseSchema.extend({
  type: z.literal("email"),
  to: z.string().trim().email(),
});

const webhookSchema = baseSchema.extend({
  type: z.literal("webhook"),
  url: z.string().trim().url(),
});

const createSchema = z.discriminatedUnion("type", [
  telegramSchema,
  discordSchema,
  slackSchema,
  gotifySchema,
  ntfySchema,
  pushbulletSchema,
  pushoverSchema,
  emailSchema,
  webhookSchema,
]);

export async function GET() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const dbUser = await upsertUser(user.username, user.groups);
  const endpoints = await listNotificationEndpointsForOwner(dbUser.id);
  return NextResponse.json({ endpoints });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const dbUser = await upsertUser(user.username, user.groups);

  let payload: z.infer<typeof createSchema>;
  try {
    payload = createSchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("[profile/notification-endpoints] invalid create payload", {
        issues: error.issues,
      });
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const config =
    payload.type === "telegram"
      ? { botToken: payload.botToken, chatId: payload.chatId }
      : payload.type === "discord"
      ? { webhookUrl: payload.webhookUrl }
      : payload.type === "slack"
      ? { webhookUrl: payload.webhookUrl }
      : payload.type === "gotify"
      ? { baseUrl: payload.baseUrl, token: payload.token }
      : payload.type === "ntfy"
      ? { topic: payload.topic, baseUrl: payload.baseUrl ?? "https://ntfy.sh" }
      : payload.type === "pushbullet"
      ? { accessToken: payload.accessToken }
      : payload.type === "pushover"
      ? { apiToken: payload.apiToken, userKey: payload.userKey }
      : payload.type === "email"
      ? { to: payload.to }
      : { url: payload.url };

  const endpoint = await createNotificationEndpoint({
    name: payload.name,
    type: payload.type as NotificationEndpointType,
    enabled: payload.enabled ?? true,
    is_global: false,
    owner_user_id: dbUser.id,
    events: payload.events,
    config,
  });

  await addUserNotificationEndpointId(dbUser.id, endpoint.id);

  return NextResponse.json({ endpoint }, { status: 201 });
}
