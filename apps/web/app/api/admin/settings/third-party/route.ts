import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getThirdPartyAuthSettings, setThirdPartyAuthSettings } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

const inputSchema = z.object({
  settings: z.object({
    google: z.object({
      enabled: z.boolean(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional()
    }),
    github: z.object({
      enabled: z.boolean(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional()
    }),
    telegram: z.object({
      enabled: z.boolean(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional()
    })
  })
});

function toPublicSettings(settings: Awaited<ReturnType<typeof getThirdPartyAuthSettings>>) {
  return {
    google: {
      enabled: settings.google.enabled,
      clientId: settings.google.clientId,
      configured: Boolean(settings.google.clientId.trim() && settings.google.clientSecret.trim()),
      hasClientSecret: Boolean(settings.google.clientSecret.trim())
    },
    github: {
      enabled: settings.github.enabled,
      clientId: settings.github.clientId,
      configured: Boolean(settings.github.clientId.trim() && settings.github.clientSecret.trim()),
      hasClientSecret: Boolean(settings.github.clientSecret.trim())
    },
    telegram: {
      enabled: settings.telegram.enabled,
      clientId: settings.telegram.clientId,
      configured: Boolean(settings.telegram.clientId.trim() && settings.telegram.clientSecret.trim()),
      hasClientSecret: Boolean(settings.telegram.clientSecret.trim())
    }
  };
}

function getTelegramIconUrl(): string | null {
  const baseUrl = process.env.APP_BASE_URL?.trim();
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}/icon-512.png`;
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const settings = await getThirdPartyAuthSettings();
  return jsonResponseWithETag(req, {
    settings: toPublicSettings(settings),
    appBaseUrl: process.env.APP_BASE_URL ?? "",
    telegramIconUrl: getTelegramIconUrl()
  });
}

export async function PUT(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const incoming = parsed.data.settings;
  const current = await getThirdPartyAuthSettings();

  const next = {
    google: {
      enabled: incoming.google.enabled,
      clientId: incoming.google.clientId?.trim() ?? "",
      clientSecret: incoming.google.clientSecret?.trim() || current.google.clientSecret
    },
    github: {
      enabled: incoming.github.enabled,
      clientId: incoming.github.clientId?.trim() ?? "",
      clientSecret: incoming.github.clientSecret?.trim() || current.github.clientSecret
    },
    telegram: {
      enabled: incoming.telegram.enabled,
      clientId: incoming.telegram.clientId?.trim() ?? "",
      clientSecret: incoming.telegram.clientSecret?.trim() || current.telegram.clientSecret
    }
  };

  await setThirdPartyAuthSettings(next);

  await logAuditEvent({
    action: "admin.settings_changed",
    actor: user.username,
    metadata: {
      section: "third_party_auth",
      googleEnabled: next.google.enabled,
      googleConfigured: Boolean(next.google.clientId && next.google.clientSecret),
      githubEnabled: next.github.enabled,
      githubConfigured: Boolean(next.github.clientId && next.github.clientSecret),
      telegramEnabled: next.telegram.enabled,
      telegramConfigured: Boolean(next.telegram.clientId && next.telegram.clientSecret)
    },
    ip: getClientIp(req)
  });

  return NextResponse.json({
    ok: true,
    settings: toPublicSettings(next),
    appBaseUrl: process.env.APP_BASE_URL ?? "",
    telegramIconUrl: getTelegramIconUrl()
  });
}
