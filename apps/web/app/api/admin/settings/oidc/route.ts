import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getOidcConfig, setOidcConfig, OidcConfig } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

const inputSchema = z.object({
  enabled: z.boolean().optional(),
  issuer: z.string().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().optional(),
  authorizationUrl: z.string().optional(),
  tokenUrl: z.string().optional(),
  userinfoUrl: z.string().optional(),
  jwksUrl: z.string().optional(),
  logoutUrl: z.string().optional(),
  scopes: z.union([z.array(z.string()), z.string()]).optional(),
  usernameClaim: z.string().optional(),
  emailClaim: z.string().optional(),
  groupsClaim: z.string().optional(),
  allowAutoCreate: z.boolean().optional(),
  matchByEmail: z.boolean().optional(),
  matchByUsername: z.boolean().optional(),
  syncGroups: z.boolean().optional()
});

function normalizeScopes(scopes: string[] | string | undefined): string[] {
  if (!scopes) return [];
  if (Array.isArray(scopes)) return scopes.map(s => s.trim()).filter(Boolean);
  return scopes.split(/\s+/).map(s => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const config = await getOidcConfig();
  const { clientSecret, ...safeConfig } = config;
  return jsonResponseWithETag(req, { config: safeConfig });
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
    return NextResponse.json({ error: "Invalid input", details: err?.issues ?? [] }, { status: 400 });
  }

  const current = await getOidcConfig();
  const next: OidcConfig = {
    ...current,
    enabled: parsed.enabled ?? current.enabled,
    issuer: parsed.issuer?.trim() ?? current.issuer,
    clientId: parsed.clientId?.trim() ?? current.clientId,
    clientSecret: parsed.clientSecret?.trim() || current.clientSecret,
    redirectUri: parsed.redirectUri?.trim() ?? current.redirectUri,
    authorizationUrl: parsed.authorizationUrl?.trim() ?? current.authorizationUrl,
    tokenUrl: parsed.tokenUrl?.trim() ?? current.tokenUrl,
    userinfoUrl: parsed.userinfoUrl?.trim() ?? current.userinfoUrl,
    jwksUrl: parsed.jwksUrl?.trim() ?? current.jwksUrl,
    logoutUrl: parsed.logoutUrl?.trim() ?? current.logoutUrl,
    scopes: normalizeScopes(parsed.scopes).length ? normalizeScopes(parsed.scopes) : current.scopes,
    usernameClaim: parsed.usernameClaim?.trim() || current.usernameClaim,
    emailClaim: parsed.emailClaim?.trim() || current.emailClaim,
    groupsClaim: parsed.groupsClaim?.trim() || current.groupsClaim,
    allowAutoCreate: parsed.allowAutoCreate ?? current.allowAutoCreate,
    matchByEmail: parsed.matchByEmail ?? current.matchByEmail,
    matchByUsername: parsed.matchByUsername ?? current.matchByUsername,
    syncGroups: parsed.syncGroups ?? current.syncGroups
  };

  await setOidcConfig(next);

  await logAuditEvent({
    action: "admin.settings_changed",
    actor: user.username,
    metadata: { section: "oidc" },
    ip: getClientIp(req)
  });

  return NextResponse.json({ ok: true, config: next });
}
