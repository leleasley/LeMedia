import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getTraktConfig, setTraktConfig, TraktConfig } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

const inputSchema = z.object({
  enabled: z.boolean().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().optional()
});

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const config = await getTraktConfig();
  const { clientSecret, ...safeConfig } = config;
  return jsonResponseWithETag(req, { config: { ...safeConfig, hasClientSecret: Boolean(clientSecret) } });
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

  let parsed: z.infer<typeof inputSchema>;
  try {
    parsed = inputSchema.parse(body);
  } catch (err: any) {
    if (err?.issues) {
      console.warn("[API] Invalid Trakt settings payload", { issues: err.issues });
    } else {
      console.warn("[API] Invalid Trakt settings payload", { err });
    }
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const current = await getTraktConfig();
  const nextClientId = parsed.clientId?.trim() ?? current.clientId;
  const nextRedirect = parsed.redirectUri?.trim() ?? current.redirectUri;
  const nextClientSecret = parsed.clientSecret?.trim() || current.clientSecret;
  const credentialsChanged =
    nextClientId !== current.clientId ||
    nextRedirect !== current.redirectUri ||
    (parsed.clientSecret?.trim() && parsed.clientSecret.trim() !== current.clientSecret);
  const next: TraktConfig = {
    ...current,
    enabled: parsed.enabled ?? current.enabled,
    clientId: nextClientId,
    clientSecret: nextClientSecret,
    redirectUri: nextRedirect,
    appAuthorizedAt: credentialsChanged ? null : current.appAuthorizedAt
  };

  await setTraktConfig(next);

  await logAuditEvent({
    action: "admin.settings_changed",
    actor: user.username,
    metadata: { section: "trakt" },
    ip: getClientIp(req)
  });

  const { clientSecret, ...safeConfig } = next;
  return NextResponse.json({ ok: true, config: { ...safeConfig, hasClientSecret: Boolean(clientSecret) } });
}
