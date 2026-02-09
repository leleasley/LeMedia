import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { getOidcSettings, setOidcSettings, type OidcProviderConfig, type OidcSettings } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";

const providerSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  providerType: z.enum(["oidc", "duo_websdk"]).optional(),
  duoApiHostname: z.string().optional(),
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

const inputSchema = z.object({
  activeProviderId: z.string().nullable().optional(),
  providers: z.array(providerSchema).optional()
});

function normalizeScopes(scopes: string[] | string | undefined): string[] {
  if (!scopes) return [];
  if (Array.isArray(scopes)) return scopes.map(s => s.trim()).filter(Boolean);
  return scopes.split(/\s+/).map(s => s.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const settings = await getOidcSettings();
  const safeProviders = settings.providers.map(({ clientSecret, ...safe }) => safe);
  return jsonResponseWithETag(req, { settings: { ...settings, providers: safeProviders } });
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

  const current = await getOidcSettings();
  const incomingProviders = parsed.providers ?? current.providers;

  const nextProviders: OidcProviderConfig[] = incomingProviders.map((provider) => {
    const existing = current.providers.find((p) => p.id === provider.id);
    const normalizedScopes = normalizeScopes(provider.scopes);
    return {
      id: provider.id,
      name: provider.name?.trim() || existing?.name || "OIDC Provider",
      providerType: provider.providerType ?? existing?.providerType ?? "oidc",
      duoApiHostname: provider.duoApiHostname?.trim() ?? existing?.duoApiHostname ?? "",
      enabled: provider.enabled ?? existing?.enabled ?? false,
      issuer: provider.issuer?.trim() ?? existing?.issuer ?? "",
      clientId: provider.clientId?.trim() ?? existing?.clientId ?? "",
      clientSecret: provider.clientSecret?.trim() || existing?.clientSecret || "",
      redirectUri: provider.redirectUri?.trim() ?? existing?.redirectUri ?? "",
      authorizationUrl: provider.authorizationUrl?.trim() ?? existing?.authorizationUrl ?? "",
      tokenUrl: provider.tokenUrl?.trim() ?? existing?.tokenUrl ?? "",
      userinfoUrl: provider.userinfoUrl?.trim() ?? existing?.userinfoUrl ?? "",
      jwksUrl: provider.jwksUrl?.trim() ?? existing?.jwksUrl ?? "",
      logoutUrl: provider.logoutUrl?.trim() ?? existing?.logoutUrl ?? "",
      scopes: normalizedScopes.length ? normalizedScopes : existing?.scopes ?? ["openid", "profile", "email"],
      usernameClaim: provider.usernameClaim?.trim() || existing?.usernameClaim || "preferred_username",
      emailClaim: provider.emailClaim?.trim() || existing?.emailClaim || "email",
      groupsClaim: provider.groupsClaim?.trim() || existing?.groupsClaim || "groups",
      allowAutoCreate: provider.allowAutoCreate ?? existing?.allowAutoCreate ?? false,
      matchByEmail: provider.matchByEmail ?? existing?.matchByEmail ?? true,
      matchByUsername: provider.matchByUsername ?? existing?.matchByUsername ?? true,
      syncGroups: provider.syncGroups ?? existing?.syncGroups ?? false
    };
  });

  let activeProviderId = parsed.activeProviderId ?? current.activeProviderId ?? null;
  if (activeProviderId && !nextProviders.some((p) => p.id === activeProviderId)) {
    return NextResponse.json({ error: "Active provider not found" }, { status: 400 });
  }

  // Enforce single active provider
  const updatedProviders = nextProviders.map((provider) => ({
    ...provider,
    enabled: activeProviderId ? provider.id === activeProviderId : false
  }));

  const next: OidcSettings = {
    activeProviderId,
    providers: updatedProviders
  };

  await setOidcSettings(next);

  await logAuditEvent({
    action: "admin.settings_changed",
    actor: user.username,
    metadata: { section: "oidc" },
    ip: getClientIp(req)
  });

  return NextResponse.json({ ok: true, settings: next });
}
