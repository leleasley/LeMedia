import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { createUserSession, getJellyfinConfig, getSettingInt, getUserByEmailOrUsername, getUserByJellyfinUserId, getUserRequestStats, linkUserToJellyfin, setJellyfinConfig } from "@/db";
import { encryptSecret } from "@/lib/encryption";
import {
  jellyfinAuthenticate,
  jellyfinLogin,
  validateJellyfinAdmin,
  createJellyfinApiKey,
  fetchJellyfinServerInfo,
  getJellyfinBaseUrl
} from "@/lib/jellyfin-admin";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";
import { logAuditEvent } from "@/lib/audit-log";
import { checkLockout, checkRateLimit, clearFailures, getClientIp, recordFailure } from "@/lib/rate-limit";
import { invalidateJellyfinCaches } from "@/lib/jellyfin";
import { logger } from "@/lib/logger";
import { createSessionToken } from "@/lib/session";
import { normalizeGroupList } from "@/lib/groups";
import { randomUUID } from "crypto";
import { getCookieBase, getRequestContext } from "@/lib/proxy";

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

const streamyfinAuthSchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
  email: z.string().optional(),
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

function formatRetryMessage(retryAfterSec: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterSec / 60));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

function toSeerrUser(user: {
  id: number;
  username: string;
  display_name?: string | null;
  email?: string | null;
  groups?: string[] | string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  last_seen_at?: string | null;
  requestCount?: number;
  movieQuotaLimit?: number | null;
  movieQuotaDays?: number | null;
  tvQuotaLimit?: number | null;
  tvQuotaDays?: number | null;
}) {
  const groups = normalizeGroupList(user.groups);
  const isAdmin = groups.includes("administrators");
  const permissions = isAdmin ? 2 : (32 | 262144 | 524288);
  return {
    id: user.id,
    email: user.email ?? null,
    username: user.username,
    displayName: user.display_name ?? user.username,
    permissions,
    avatar: user.avatar_url ?? null,
    createdAt: user.created_at ?? null,
    updatedAt: user.last_seen_at ?? user.created_at ?? null,
    isAdmin,
    requestCount: user.requestCount ?? 0,
    movieQuotaLimit: user.movieQuotaLimit ?? null,
    movieQuotaDays: user.movieQuotaDays ?? null,
    tvQuotaLimit: user.tvQuotaLimit ?? null,
    tvQuotaDays: user.tvQuotaDays ?? null,
  };
}

async function handleAdminJellyfinSetup(req: NextRequest, body: unknown, user: { username: string }) {
  const csrfError = requireCsrf(req);
  if (csrfError) {
    return csrfError;
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

async function handleStreamyfinJellyseerrLogin(req: NextRequest, body: unknown) {
  const ip = getClientIp(req);
  const fail = (status: number, message: string, username?: string) => {
    logger.warn("[API] Streamyfin Jellyseerr auth failed", { status, message, username: username ?? null, ip });
    return NextResponse.json({ error: message }, { status });
  };

  const parsed = streamyfinAuthSchema.safeParse(body);
  if (!parsed.success) {
    return fail(401, "Invalid username or password");
  }

  const { username, password } = parsed.data;
  const rate = await checkRateLimit(`api:v1:auth:jellyfin:${ip}`, { windowMs: 60 * 1000, max: 30 });
  if (!rate.ok) {
    return fail(429, formatRetryMessage(rate.retryAfterSec), username);
  }

  const lockKey = `api:v1:auth:jellyfin:${username.toLowerCase()}:${ip}`;
  const lock = await checkLockout(lockKey, { windowMs: 15 * 60 * 1000, max: 10, banMs: 10 * 60 * 1000 });
  if (lock.locked) {
    return fail(429, formatRetryMessage(lock.retryAfterSec), username);
  }

  const baseUrl = await getJellyfinBaseUrl();
  if (!baseUrl) {
    return fail(503, "Jellyfin is not configured", username);
  }

  let login;
  try {
    login = await jellyfinLogin({
      baseUrl,
      username,
      password,
      deviceId: Buffer.from(`BOT_lemedia_streamyfin_${username.toLowerCase()}`).toString("base64"),
      clientIp: ip,
    });
  } catch {
    const failure = await recordFailure(lockKey, { windowMs: 15 * 60 * 1000, max: 10, banMs: 10 * 60 * 1000 });
    if (failure.locked) {
      return fail(429, formatRetryMessage(failure.retryAfterSec), username);
    }
    return fail(401, "Invalid username or password", username);
  }

  let user = await getUserByJellyfinUserId(login.userId);
  if (!user) {
    // Compatibility fallback: if the Jellyfin user ID was never linked, match by username.
    // This mirrors the import flow behavior and avoids requiring manual relinking for API clients.
    user = await getUserByEmailOrUsername(null, login.username);
  }

  if (!user) {
    return fail(403, "No linked account found for this Jellyfin user", username);
  }

  if (user.banned) {
    return fail(403, "Account suspended", username);
  }

  await clearFailures(lockKey);

  await linkUserToJellyfin({
    userId: user.id,
    jellyfinUserId: login.userId,
    jellyfinUsername: login.username,
    jellyfinDeviceId: user.jellyfin_device_id ?? Buffer.from(`BOT_lemedia_${user.username}`).toString("base64"),
    jellyfinAuthToken: login.accessToken,
    avatarUrl: user.avatar_url ?? `/avatarproxy/${login.userId}`,
  });

  const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
  const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
  const jti = randomUUID();
  const token = await createSessionToken({
    username: user.username,
    groups: normalizeGroupList(user.groups),
    maxAgeSeconds: sessionMaxAge,
    jti,
  });
  await createUserSession(user.id, jti, new Date(Date.now() + sessionMaxAge * 1000), {
    userAgent: req.headers.get("user-agent"),
    deviceLabel: "Streamyfin",
    ipAddress: ip,
  });

  await logAuditEvent({
    action: "user.login",
    actor: user.username,
    metadata: { provider: "jellyfin", client: "streamyfin" },
    ip,
  });

  const ctx = getRequestContext(req);
  const cookieBase = getCookieBase(ctx, true);
  const requestStats = await getUserRequestStats(user.username);
  const userPayload = toSeerrUser({
    ...user,
    requestCount: requestStats.total,
    movieQuotaLimit: user.request_limit_movie ?? null,
    movieQuotaDays: user.request_limit_movie_days ?? null,
    tvQuotaLimit: user.request_limit_series ?? null,
    tvQuotaDays: user.request_limit_series_days ?? null,
  });
  const freshResponse = NextResponse.json(userPayload, { status: 200 });
  freshResponse.cookies.set("lemedia_session", token, { ...cookieBase, maxAge: sessionMaxAge });
  return freshResponse;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const adminUser = await requireAdmin();
  if (!(adminUser instanceof NextResponse)) {
    return handleAdminJellyfinSetup(req, body, adminUser);
  }

  return handleStreamyfinJellyseerrLogin(req, body);
}
