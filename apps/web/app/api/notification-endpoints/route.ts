import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin, requireUser } from "@/auth";
import { createNotificationEndpoint, listNotificationEndpoints, NotificationEndpointType } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const typeSchema = z.enum(["telegram", "discord", "email", "webhook"]);

const baseSchema = z.object({
  name: z.string().trim().min(1),
  type: typeSchema,
  enabled: z.boolean().optional(),
  isGlobal: z.boolean().optional(),
  events: z.array(z.string().trim().min(1)).optional()
});

const telegramSchema = baseSchema.extend({
  type: z.literal("telegram"),
  botToken: z.string().trim().min(1),
  chatId: z.string().trim().min(1)
});

const discordSchema = baseSchema.extend({
  type: z.literal("discord"),
  webhookUrl: z
    .string()
    .trim()
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
    }, "Discord webhook URL must be a valid discord.com /api/webhooks/... URL")
});

const emailSchema = baseSchema.extend({
  type: z.literal("email"),
  to: z.string().trim().email()
});

const webhookSchema = baseSchema.extend({
  type: z.literal("webhook"),
  url: z.string().trim().url()
});

const createSchema = z.discriminatedUnion("type", [telegramSchema, discordSchema, emailSchema, webhookSchema]);

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  if (!user.username) return new NextResponse("Unauthorized", { status: 401 });
  const endpoints = await listNotificationEndpoints();
  return jsonResponseWithETag(req, { endpoints: user.isAdmin ? endpoints : endpoints.filter(e => e.enabled) });
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let payload: z.infer<typeof createSchema>;
  try {
    payload = createSchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues.map(e => e.message).join(", ") : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const config =
    payload.type === "telegram"
      ? { botToken: payload.botToken, chatId: payload.chatId }
      : payload.type === "discord"
        ? { webhookUrl: payload.webhookUrl }
        : payload.type === "email"
          ? { to: payload.to }
          : { url: payload.url };

  const created = await createNotificationEndpoint({
    name: payload.name,
    type: payload.type as NotificationEndpointType,
    enabled: payload.enabled ?? true,
    is_global: payload.isGlobal ?? false,
    events: payload.events,
    config
  });
  return NextResponse.json({ endpoint: created });
}
