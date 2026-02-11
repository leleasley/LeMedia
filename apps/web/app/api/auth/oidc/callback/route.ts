import { NextRequest, NextResponse } from "next/server";
import { createRemoteJWKSet, jwtVerify, decodeJwt, decodeProtectedHeader } from "jose";
import {
  createOidcUser,
  getActiveOidcProvider,
  getOidcProviderById,
  getSettingInt,
  getUserByEmail,
  getUserByOidcSub,
  getUserByUsername,
  updateUserOidcLink,
  createUserSession
} from "@/db";
import { createSessionToken } from "@/lib/session";
import { ensureCsrfCookie, getCookieBase, getRequestContext, sanitizeRelativePath } from "@/lib/proxy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logAuditEvent } from "@/lib/audit-log";
import { randomUUID } from "crypto";
import { summarizeUserAgent } from "@/lib/device-info";
import { normalizeGroupList } from "@/lib/groups";

type OidcDiscovery = {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  jwks_uri: string;
  issuer: string;
};

const discoveryCache = new Map<string, { data: OidcDiscovery; expiresAt: number }>();

async function getDiscovery(issuer: string): Promise<OidcDiscovery> {
  const cached = discoveryCache.get(issuer);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const trimmed = issuer.replace(/\/+$/, "");
  const res = await fetch(`${trimmed}/.well-known/openid-configuration`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to load OIDC discovery document");
  }
  const data = (await res.json()) as OidcDiscovery;
  discoveryCache.set(issuer, { data, expiresAt: Date.now() + 10 * 60 * 1000 });
  return data;
}

function redirectToLogin(
  base: string,
  message: string,
  cookieBase: { httpOnly: boolean; sameSite: "none" | "lax"; secure: boolean; path: string; domain?: string }
) {
  const url = new URL("/login", base);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set("lemedia_flash_error", message, { ...cookieBase, maxAge: 60 });
  res.cookies.set("lemedia_oidc_state", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oidc_nonce", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_login_redirect", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oidc_provider", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_sso_popup", "", { ...cookieBase, maxAge: 0 });
  return res;
}

function getClaimValue(claims: Record<string, any>, claim: string): string | undefined {
  if (!claim) return undefined;
  const parts = claim.split(".");
  let value: any = claims;
  for (const part of parts) {
    if (value && typeof value === "object" && part in value) {
      value = value[part];
    } else {
      return undefined;
    }
  }
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) return undefined;
  return String(value);
}

function parseGroupClaim(claims: Record<string, any>, claim: string): string[] {
  if (!claim) return [];
  const raw = getClaimValue(claims, claim);
  const val = raw ? [raw] : [];
  const direct = (claims as any)[claim];
  if (Array.isArray(direct)) {
    return direct.map(v => String(v).trim()).filter(Boolean);
  }
  return val.map(v => v.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const cookieBase = getCookieBase(ctx, true);
  const ip = getClientIp(req);
  const rate = await checkRateLimit(`oidc_callback:${ip}`, { windowMs: 60 * 1000, max: 30 });
  if (!rate.ok) {
    return ensureCsrfCookie(req, redirectToLogin(base, "Too many SSO attempts. Please try again shortly.", cookieBase), ctx).res;
  }

  const error = req.nextUrl.searchParams.get("error");
  const errorDesc = req.nextUrl.searchParams.get("error_description");
  if (error) {
    return ensureCsrfCookie(req, redirectToLogin(base, errorDesc || "SSO authentication failed", cookieBase), ctx).res;
  }

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const storedState = req.cookies.get("lemedia_oidc_state")?.value ?? "";
  const storedNonce = req.cookies.get("lemedia_oidc_nonce")?.value ?? "";
  const storedProviderId = req.cookies.get("lemedia_oidc_provider")?.value ?? "";
  const from = sanitizeRelativePath(req.cookies.get("lemedia_login_redirect")?.value);
  const popupRequested = req.cookies.get("lemedia_sso_popup")?.value === "1";

  if (!code || !state || !storedState || state !== storedState) {
    return ensureCsrfCookie(req, redirectToLogin(base, "SSO session expired. Please try again.", cookieBase), ctx).res;
  }

  let config = storedProviderId ? await getOidcProviderById(storedProviderId) : null;
  if (storedProviderId && (!config || !config.enabled || !config.issuer || !config.clientId)) {
    return ensureCsrfCookie(req, redirectToLogin(base, "SSO session expired. Please try again.", cookieBase), ctx).res;
  }
  if (!config) {
    config = await getActiveOidcProvider();
  }
  if (!config) {
    return ensureCsrfCookie(req, redirectToLogin(base, "SSO is not configured", cookieBase), ctx).res;
  }

  const isDuoProvider = config.providerType === "duo_websdk" || /duo/i.test(config.name ?? "") || !!config.duoApiHostname;
  if (isDuoProvider) {
    return ensureCsrfCookie(req, redirectToLogin(base, "Duo Web SDK is configured, but the login flow is not wired yet.", cookieBase), ctx).res;
  }

  let discovery: OidcDiscovery | null = null;
  const needsDiscovery = !config.tokenUrl || !config.jwksUrl || !config.userinfoUrl;
  if (needsDiscovery) {
    const issuer = config.issuer ?? "";
    if (!issuer) {
      return ensureCsrfCookie(req, redirectToLogin(base, "SSO issuer is not configured", cookieBase), ctx).res;
    }
    try {
      discovery = await getDiscovery(issuer);
    } catch {
      return ensureCsrfCookie(req, redirectToLogin(base, "Unable to contact OIDC provider", cookieBase), ctx).res;
    }
  }

  const redirectUri = config.redirectUri || `${base}/api/auth/oidc/callback`;
  const tokenEndpoint = config.tokenUrl || discovery?.token_endpoint;
  if (!tokenEndpoint) {
    return ensureCsrfCookie(req, redirectToLogin(base, "SSO token endpoint is not configured", cookieBase), ctx).res;
  }
  if (!config.clientId) {
    return ensureCsrfCookie(req, redirectToLogin(base, "SSO client ID is not configured", cookieBase), ctx).res;
  }
  let tokenData: any;
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: config.clientId
    });
    if (config.clientSecret) {
      body.set("client_secret", config.clientSecret);
    }
    const tokenRes = await fetch(tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      throw new Error(tokenData?.error_description || "Token exchange failed");
    }
  } catch {
    return ensureCsrfCookie(req, redirectToLogin(base, "Unable to complete SSO login", cookieBase), ctx).res;
  }

  const idToken = tokenData?.id_token;
  if (!idToken) {
    return ensureCsrfCookie(req, redirectToLogin(base, "Invalid SSO response", cookieBase), ctx).res;
  }

  let claims: Record<string, any>;
  try {
    const jwksUrl = config.jwksUrl || discovery?.jwks_uri;
    if (!jwksUrl) throw new Error("Missing JWKS URL");
    const jwks = createRemoteJWKSet(new URL(jwksUrl));
    const issuer = config.issuer || discovery?.issuer;
    const verifyOptions: { issuer?: string; audience: string } = {
      audience: config.clientId
    };
    if (issuer) verifyOptions.issuer = issuer;
    const verified = await jwtVerify(idToken, jwks, verifyOptions);
    claims = verified.payload as Record<string, any>;
  } catch (err) {
    // Never log sensitive OIDC data in production
    if (process.env.OIDC_DEBUG === "1" && process.env.NODE_ENV !== "production") {
      try {
        const header = decodeProtectedHeader(idToken);
        const payload = decodeJwt(idToken);
        logger.error("[OIDC] token verify failed", err);
        logger.debug("[OIDC] token header", { header });
        logger.debug("[OIDC] token payload", { payload });
      } catch (decodeErr) {
        logger.error("[OIDC] token decode failed", decodeErr);
      }
    } else {
      logger.error("[OIDC] token verify failed", err);
    }
    return ensureCsrfCookie(req, redirectToLogin(base, "Unable to verify SSO token", cookieBase), ctx).res;
  }

  if (storedNonce && claims?.nonce && claims.nonce !== storedNonce) {
    return ensureCsrfCookie(req, redirectToLogin(base, "SSO session expired. Please try again.", cookieBase), ctx).res;
  }

  const userinfoEndpoint = config.userinfoUrl || discovery?.userinfo_endpoint;
  if (tokenData?.access_token && userinfoEndpoint) {
    try {
      const userinfoRes = await fetch(userinfoEndpoint, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      if (userinfoRes.ok) {
        const userinfo = await userinfoRes.json();
        claims = { ...claims, ...userinfo };
      }
    } catch {
      // ignore userinfo failures
    }
  }

  const sub = claims?.sub ? String(claims.sub) : "";
  if (!sub) {
    return ensureCsrfCookie(req, redirectToLogin(base, "SSO response missing subject", cookieBase), ctx).res;
  }

  const emailClaim = config.emailClaim || "email";
  const usernameClaim = config.usernameClaim || "preferred_username";
  const groupsClaim = config.groupsClaim || "groups";
  const email = getClaimValue(claims, emailClaim)?.toLowerCase();
  const rawUsername = getClaimValue(claims, usernameClaim);
  const username = rawUsername ? rawUsername.toLowerCase() : "";
  const groupsFromClaims = config.syncGroups ? parseGroupClaim(claims, groupsClaim) : [];
  const safeGroups = normalizeGroupList(groupsFromClaims, { fallbackToDefault: false })
    .filter(group => group !== "administrators");

  let user = await getUserByOidcSub(sub);
  if (!user && config.matchByEmail && email) {
    user = await getUserByEmail(email);
  }
  if (!user && config.matchByUsername && username) {
    user = await getUserByUsername(username);
  }

  if (user?.oidc_sub && user.oidc_sub !== sub) {
    return ensureCsrfCookie(req, redirectToLogin(base, "SSO account is already linked to a different user", cookieBase), ctx).res;
  }

  if (!user) {
    if (!config.allowAutoCreate) {
      return ensureCsrfCookie(req, redirectToLogin(base, "No local account found for this SSO user", cookieBase), ctx).res;
    }
    const derivedUsername = username || (email ? email.split("@")[0] : "");
    if (!derivedUsername) {
      return ensureCsrfCookie(req, redirectToLogin(base, "SSO account is missing a username", cookieBase), ctx).res;
    }
    try {
      user = await createOidcUser({
        username: derivedUsername,
        email: email ?? null,
        groups: safeGroups.length ? safeGroups : ["users"],
        oidcSub: sub
      });
    } catch {
      return ensureCsrfCookie(req, redirectToLogin(base, "Unable to create local account", cookieBase), ctx).res;
    }
  } else {
    const shouldUpdateEmail = !!email && !user.email;
    const shouldUpdateGroups = config.syncGroups && safeGroups.length > 0;
    if (!user.oidc_sub || shouldUpdateEmail || shouldUpdateGroups) {
      await updateUserOidcLink({
        userId: user.id,
        oidcSub: user.oidc_sub || sub,
        email: shouldUpdateEmail ? email : undefined,
        groups: shouldUpdateGroups ? safeGroups : undefined
      });
      user = {
        ...user,
        oidc_sub: user.oidc_sub || sub,
        email: shouldUpdateEmail ? email ?? null : user.email,
        groups: shouldUpdateGroups ? safeGroups : user.groups
      };
    }
  }

  if (user.banned) {
    return ensureCsrfCookie(req, redirectToLogin(base, "Account suspended", cookieBase), ctx).res;
  }

  const defaultSession = Number(process.env.SESSION_MAX_AGE) || 60 * 60 * 24 * 30;
  const sessionMaxAge = await getSettingInt("session_max_age", defaultSession);
  const sessionGroups = normalizeGroupList(user.groups);

  await logAuditEvent({
    action: "user.login",
    actor: user.username,
    ip: ip,
    metadata: { method: "oidc", provider: config.issuer ?? "unknown" }
  });

  const jti = randomUUID();
  const token = await createSessionToken({ username: user.username, groups: sessionGroups, maxAgeSeconds: sessionMaxAge, jti });
  const userAgent = req.headers.get("user-agent");
  const deviceLabel = summarizeUserAgent(userAgent);
  await createUserSession(user.id, jti, new Date(Date.now() + sessionMaxAge * 1000), {
    userAgent,
    deviceLabel,
    ipAddress: ip
  });
  const redirectTarget = popupRequested
    ? (() => {
        const url = new URL("/auth/popup-complete", base);
        url.searchParams.set("from", from || "/");
        return url;
      })()
    : new URL(from, base);
  const res = NextResponse.redirect(redirectTarget);
  res.cookies.set("lemedia_session", token, { ...cookieBase, maxAge: sessionMaxAge });
  // Clear any stale flash state before setting success
  res.cookies.set("lemedia_flash", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_flash_error", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_flash", "login-success", { ...cookieBase, maxAge: 120 });
  res.cookies.set("lemedia_user", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_groups", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_expires", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_login_redirect", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oidc_state", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oidc_nonce", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oidc_provider", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_sso_popup", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_force_login", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_mfa_token", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_session_reset", "", { ...cookieBase, httpOnly: false, maxAge: 0 });
  return ensureCsrfCookie(req, res, ctx).res;
}
