import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { deleteNotificationEndpoint, getNotificationEndpointByIdFull, updateNotificationEndpoint } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logger } from "@/lib/logger";

const idSchema = z.object({ id: z.coerce.number().int().positive() });
type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

const UpdateBodySchema = z.object({
  name: z.string().trim().min(1),
  enabled: z.boolean(),
  isGlobal: z.boolean(),
  events: z.array(z.string().trim().min(1)).default([]),
  type: z.enum(["telegram", "discord", "email", "webhook"]),
  botToken: z.string().trim().optional(),
  chatId: z.string().trim().optional(),
  webhookUrl: z
    .string()
    .trim()
    .optional()
    .refine(
      url => {
        if (!url) return true;
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
      },
      { message: "Discord webhook URL must be a valid discord.com /api/webhooks/... URL" }
    ),
  to: z.string().trim().optional(),
  url: z.string().trim().optional()
});

export async function GET(_req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const parsed = idSchema.safeParse(await resolveParams(params));
  if (!parsed.success) return jsonResponseWithETag(_req, { error: "Invalid id" }, { status: 400 });

  const endpoint = await getNotificationEndpointByIdFull(parsed.data.id);
  if (!endpoint) return jsonResponseWithETag(_req, { error: "Not found" }, { status: 404 });
  return jsonResponseWithETag(_req, { endpoint });
}

export async function PATCH(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsed = idSchema.safeParse(await resolveParams(params));
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let body: z.infer<typeof UpdateBodySchema>;
  try {
    body = UpdateBodySchema.parse(await req.json());
  } catch (err) {
    if (err instanceof z.ZodError) {
      logger.warn("[API] Invalid notification endpoint payload", { issues: err.issues });
    } else {
      logger.warn("[API] Invalid notification endpoint payload", { err });
    }
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const config =
    body.type === "telegram"
      ? { botToken: body.botToken ?? "", chatId: body.chatId ?? "" }
      : body.type === "discord"
        ? { webhookUrl: body.webhookUrl ?? "" }
        : body.type === "email"
          ? { to: body.to ?? "" }
          : { url: body.url ?? "" };

  if (body.type === "telegram" && (!config.botToken || !config.chatId)) {
    return NextResponse.json({ error: "Telegram bot token and chat id are required" }, { status: 400 });
  }
  if (body.type === "discord" && !config.webhookUrl) {
    return NextResponse.json({ error: "Discord webhook URL is required" }, { status: 400 });
  }
  if (body.type === "email" && !config.to) {
    return NextResponse.json({ error: "Email to address is required" }, { status: 400 });
  }
  if (body.type === "webhook" && !config.url) {
    return NextResponse.json({ error: "Webhook URL is required" }, { status: 400 });
  }

  const updated = await updateNotificationEndpoint(parsed.data.id, {
    name: body.name,
    enabled: body.enabled,
    is_global: body.isGlobal,
    events: body.events,
    config
  });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ endpoint: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const parsed = idSchema.safeParse(await resolveParams(params));
  if (!parsed.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  await deleteNotificationEndpoint(parsed.data.id);
  return NextResponse.json({ ok: true });
}
