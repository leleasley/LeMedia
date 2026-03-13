import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  deleteNotificationEndpoint,
  getNotificationEndpointByIdForOwner,
  updateNotificationEndpoint,
  upsertUser,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

const idSchema = z.object({ id: z.coerce.number().int().positive() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as Promise<{ id: string }>).then === "function") {
    return await (params as Promise<{ id: string }>);
  }
  return params as { id: string };
}

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

const updateBodySchema = z.object({
  name: z.string().trim().min(1),
  enabled: z.boolean(),
  events: z.array(z.string().trim().min(1)).default([]),
  type: z.enum(["telegram", "discord", "email", "webhook", "slack", "gotify", "ntfy", "pushbullet", "pushover"]),
  botToken: z.string().trim().optional(),
  chatId: z.string().trim().optional(),
  webhookUrl: z
    .string()
    .trim()
    .url()
    .refine(isValidDiscordWebhookUrl, "Discord webhook URL must be a valid discord.com /api/webhooks/... URL")
    .optional(),
  slackWebhookUrl: z.string().trim().url().optional(),
  to: z.string().trim().email().optional(),
  url: z.string().trim().url().optional(),
  baseUrl: z.string().trim().url().optional(),
  token: z.string().trim().optional(),
  topic: z.string().trim().optional(),
  accessToken: z.string().trim().optional(),
  apiToken: z.string().trim().optional(),
  userKey: z.string().trim().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const parsed = idSchema.safeParse(await resolveParams(params));
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const dbUser = await upsertUser(user.username, user.groups);
  const endpoint = await getNotificationEndpointByIdForOwner(parsed.data.id, dbUser.id);
  if (!endpoint) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ endpoint });
}

export async function PATCH(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsed = idSchema.safeParse(await resolveParams(params));
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const dbUser = await upsertUser(user.username, user.groups);
  const existing = await getNotificationEndpointByIdForOwner(parsed.data.id, dbUser.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: z.infer<typeof updateBodySchema>;
  try {
    body = updateBodySchema.parse(await req.json());
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn("[profile/notification-endpoints] invalid update payload", {
        issues: error.issues,
      });
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (body.type === "telegram" && (!body.botToken || !body.chatId)) {
    return NextResponse.json(
      { error: "Telegram bot token and chat id are required" },
      { status: 400 }
    );
  }
  if (body.type === "discord" && !body.webhookUrl) {
    return NextResponse.json({ error: "Discord webhook URL is required" }, { status: 400 });
  }
  if (body.type === "slack" && !body.slackWebhookUrl) {
    return NextResponse.json({ error: "Slack webhook URL is required" }, { status: 400 });
  }
  if (body.type === "gotify" && (!body.baseUrl || !body.token)) {
    return NextResponse.json({ error: "Gotify base URL and token are required" }, { status: 400 });
  }
  if (body.type === "ntfy" && !body.topic) {
    return NextResponse.json({ error: "ntfy topic is required" }, { status: 400 });
  }
  if (body.type === "pushbullet" && !body.accessToken) {
    return NextResponse.json({ error: "Pushbullet access token is required" }, { status: 400 });
  }
  if (body.type === "pushover" && (!body.apiToken || !body.userKey)) {
    return NextResponse.json({ error: "Pushover API token and user key are required" }, { status: 400 });
  }
  if (body.type === "email" && !body.to) {
    return NextResponse.json({ error: "Email to address is required" }, { status: 400 });
  }
  if (body.type === "webhook" && !body.url) {
    return NextResponse.json({ error: "Webhook URL is required" }, { status: 400 });
  }

  const config =
    body.type === "telegram"
      ? { botToken: body.botToken ?? "", chatId: body.chatId ?? "" }
      : body.type === "discord"
      ? { webhookUrl: body.webhookUrl ?? "" }
      : body.type === "slack"
      ? { webhookUrl: body.slackWebhookUrl ?? "" }
      : body.type === "gotify"
      ? { baseUrl: body.baseUrl ?? "", token: body.token ?? "" }
      : body.type === "ntfy"
      ? { topic: body.topic ?? "", baseUrl: body.baseUrl ?? "https://ntfy.sh" }
      : body.type === "pushbullet"
      ? { accessToken: body.accessToken ?? "" }
      : body.type === "pushover"
      ? { apiToken: body.apiToken ?? "", userKey: body.userKey ?? "" }
      : body.type === "email"
      ? { to: body.to ?? "" }
      : { url: body.url ?? "" };

  const updated = await updateNotificationEndpoint(parsed.data.id, {
    name: body.name,
    enabled: body.enabled,
    is_global: false,
    owner_user_id: dbUser.id,
    events: body.events,
    config,
  });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ endpoint: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsed = idSchema.safeParse(await resolveParams(params));
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const dbUser = await upsertUser(user.username, user.groups);
  const existing = await getNotificationEndpointByIdForOwner(parsed.data.id, dbUser.id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await deleteNotificationEndpoint(parsed.data.id);
  return NextResponse.json({ ok: true });
}
