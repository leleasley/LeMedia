import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getActiveOidcProvider } from "@/db";
import { getCookieBase, getRequestContext, sanitizeRelativePath } from "@/lib/proxy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

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

function randomString(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export async function GET(req: NextRequest) {
  const config = await getActiveOidcProvider();
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const from = sanitizeRelativePath(req.nextUrl.searchParams.get("from"));
  const turnstileToken = req.nextUrl.searchParams.get("turnstile_token") ?? "";
  const ip = getClientIp(req);
  const rate = checkRateLimit(`oidc_login:${ip}`, { windowMs: 60 * 1000, max: 20 });

  if (!rate.ok) {
    const url = new URL("/login", base);
    url.searchParams.set("error", "Too many SSO attempts. Please try again shortly.");
    return NextResponse.redirect(url);
  }

  const turnstileValid = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileValid) {
    const url = new URL("/login", base);
    url.searchParams.set("error", "Invalid security challenge. Please try again.");
    return NextResponse.redirect(url);
  }

  if (!config) {
    const url = new URL("/login", base);
    url.searchParams.set("error", "SSO is not configured");
    return NextResponse.redirect(url);
  }

  const isDuoProvider = config.providerType === "duo_websdk" || /duo/i.test(config.name ?? "") || !!config.duoApiHostname;
  if (isDuoProvider) {
    const url = new URL("/login", base);
    url.searchParams.set("error", "Duo Web SDK is configured, but the login flow is not wired yet.");
    return NextResponse.redirect(url);
  }

  let authorizationUrl = config.authorizationUrl;
  if (!authorizationUrl) {
    try {
      const discovery = await getDiscovery(config.issuer);
      authorizationUrl = discovery.authorization_endpoint;
    } catch {
      const url = new URL("/login", base);
      url.searchParams.set("error", "Unable to contact OIDC provider");
      return NextResponse.redirect(url);
    }
  }

  const state = randomString(16);
  const nonce = randomString(16);
  const redirectUri = config.redirectUri || `${base}/api/auth/oidc/callback`;
  const authUrl = new URL(authorizationUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", config.scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("nonce", nonce);

  const res = NextResponse.redirect(authUrl.toString(), { status: 303 });
  const cookieBase = getCookieBase(ctx, true);
  res.cookies.set("lemedia_oidc_state", state, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oidc_nonce", nonce, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oidc_provider", config.id, { ...cookieBase, maxAge: 60 * 30 });
  res.cookies.set("lemedia_login_redirect", from, { ...cookieBase, maxAge: 60 * 30 });
  return res;
}
