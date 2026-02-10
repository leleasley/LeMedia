import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJellyfinConfig, setJellyfinConfig } from "@/db";
import { encryptSecret } from "@/lib/encryption";
import {
  jellyfinAuthenticate,
  validateJellyfinAdmin,
  createJellyfinApiKey,
  fetchJellyfinServerInfo
} from "@/lib/jellyfin-admin";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { getClientIp } from "@/lib/rate-limit";
import { invalidateJellyfinCaches } from "@/lib/jellyfin";
import { logger } from "@/lib/logger";

const authPayloadSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  // For initial setup (server not configured yet):
  hostname: z.string().trim().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  useSsl: z.boolean().optional(),
  urlBase: z.string().optional(),
  externalUrl: z.string().optional(),
});

function buildBaseUrl(
  hostname: string,
  port: number,
  useSsl: boolean,
  urlBase: string
): string {
  const portStr = port ? `:${port}` : "";
  const path = urlBase ? (urlBase.startsWith("/") ? urlBase : `/${urlBase}`) : "";
  return `${useSsl ? "https" : "http"}://${hostname}${portStr}${path}`;
}

export async function POST(req: NextRequest) {
  // Require admin authentication
  const user = await requireAdmin();
  if (user instanceof NextResponse) {
    return user;
  }

  // Require CSRF token
  const csrfError = requireCsrf(req);
  if (csrfError) {
    return csrfError;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = authPayloadSchema.safeParse(body);
  if (!parsed.success) {
    logger.warn("[API] Invalid Jellyfin auth payload", { issues: parsed.error.issues });
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  const { username, password, hostname, port, useSsl, urlBase, externalUrl } = parsed.data;

  // Get current config to check if Jellyfin is already configured
  const currentConfig = await getJellyfinConfig();
  const isInitialSetup = !currentConfig.hostname || !currentConfig.apiKeyEncrypted;

  // Determine server parameters
  let serverHostname: string;
  let serverPort: number;
  let serverUseSsl: boolean;
  let serverUrlBase: string;

  if (isInitialSetup) {
    // Initial setup - require server parameters
    if (!hostname || port === undefined || useSsl === undefined) {
      return NextResponse.json(
        { error: "Server configuration required for initial setup (hostname, port, useSsl)" },
        { status: 400 }
      );
    }
    serverHostname = hostname;
    serverPort = port;
    serverUseSsl = useSsl;
    serverUrlBase = urlBase ?? "";
  } else {
    // Reconfiguration - use existing server settings or provided ones
    serverHostname = hostname ?? currentConfig.hostname;
    serverPort = port ?? currentConfig.port;
    serverUseSsl = useSsl ?? currentConfig.useSsl;
    serverUrlBase = urlBase ?? currentConfig.urlBase;
  }

  // Build Jellyfin base URL
  const baseUrl = buildBaseUrl(serverHostname, serverPort, serverUseSsl, serverUrlBase);

  try {
    // Authenticate with Jellyfin
    const clientIp = getClientIp(req);
    const authResult = await jellyfinAuthenticate({
      baseUrl,
      username,
      password,
      clientIp,
    });

    // Validate admin permissions
    const isAdmin = await validateJellyfinAdmin(baseUrl, authResult.accessToken);
    if (!isAdmin) {
      await logAuditEvent({
        action: "admin.jellyfin_auth_failed",
        actor: user.username,
        metadata: { reason: "not_admin", jellyfinUsername: username },
        ip: clientIp,
      });
      return NextResponse.json(
        { error: "User must be a Jellyfin administrator" },
        { status: 403 }
      );
    }

    // Create API key for LeMedia
    const apiKey = await createJellyfinApiKey(baseUrl, authResult.accessToken);

    // Get server info (serverId and serverName) if not already in auth response
    let serverId = authResult.serverId ?? currentConfig.serverId ?? "";
    let serverName = authResult.serverName ?? currentConfig.name ?? "";

    if (!serverId || !serverName) {
      const serverInfo = await fetchJellyfinServerInfo(baseUrl, apiKey);
      serverId = serverInfo.id ?? serverId;
      serverName = serverInfo.name ?? serverName;
    }

    // Save configuration
    await setJellyfinConfig({
      name: serverName,
      hostname: serverHostname,
      port: serverPort,
      useSsl: serverUseSsl,
      urlBase: serverUrlBase,
      externalUrl: externalUrl ?? currentConfig.externalUrl ?? "",
      jellyfinForgotPasswordUrl: currentConfig.jellyfinForgotPasswordUrl ?? "",
      libraries: currentConfig.libraries ?? [],
      serverId,
      apiKeyEncrypted: encryptSecret(apiKey),
    });
    invalidateJellyfinCaches("jellyfin auth configured");

    // Log successful configuration
    await logAuditEvent({
      action: isInitialSetup ? "admin.jellyfin_configured" : "admin.jellyfin_reconfigured",
      actor: user.username,
      metadata: {
        jellyfinUsername: username,
        serverId,
        serverName
      },
      ip: clientIp,
    });

    return NextResponse.json({
      success: true,
      serverId,
      serverName,
      jellyfinUsername: authResult.username,
    });
  } catch (err: any) {
    const clientIp = getClientIp(req);
    await logAuditEvent({
      action: "admin.jellyfin_auth_failed",
      actor: user.username,
      metadata: {
        reason: err?.message || "unknown_error",
        jellyfinUsername: username
      },
      ip: clientIp,
    });

    return NextResponse.json(
      { error: err?.message || "Jellyfin authentication failed" },
      { status: 401 }
    );
  }
}
