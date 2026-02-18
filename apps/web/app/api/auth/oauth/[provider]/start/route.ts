import { NextRequest, NextResponse } from "next/server";
import { getCookieBase, getRequestContext, sanitizeRelativePath } from "@/lib/proxy";
import {
  createOAuthState,
  createPkceChallenge,
  createPkceVerifier,
  getOAuthCallbackPath,
  getOAuthConfig,
  isOAuthProvider
} from "@/lib/oauth-providers";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { provider: rawProvider } = await context.params;
  if (!isOAuthProvider(rawProvider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider" }, { status: 404 });
  }

  const provider = rawProvider;
  const config = getOAuthConfig(provider);
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const from = sanitizeRelativePath(req.nextUrl.searchParams.get("from"));
  const turnstileToken = req.nextUrl.searchParams.get("turnstile_token") ?? "";
  const ip = getClientIp(req);

  const rate = await checkRateLimit(`oauth:start:${provider}:${ip}`, { windowMs: 60 * 1000, max: 20 });
  if (!rate.ok) {
    const url = new URL("/login", base);
    url.searchParams.set("error", "Too many sign-in attempts. Please try again shortly.");
    return NextResponse.redirect(url, { status: 303 });
  }

  const turnstileValid = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileValid) {
    const url = new URL("/login", base);
    url.searchParams.set("error", "Invalid security challenge. Please try again.");
    return NextResponse.redirect(url, { status: 303 });
  }

  if (!config) {
    const url = new URL("/login", base);
    url.searchParams.set("error", `${provider === "google" ? "Google" : "GitHub"} sign-in is not configured`);
    return NextResponse.redirect(url, { status: 303 });
  }

  const state = createOAuthState();
  const verifier = createPkceVerifier();
  const challenge = createPkceChallenge(verifier);
  const redirectUri = `${base}${getOAuthCallbackPath(provider)}`;

  const authUrl = new URL(config.authorizeUrl);
  authUrl.searchParams.set("client_id", config.clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", config.scopes.join(" "));
  authUrl.searchParams.set("state", state);
  if (provider === "google") {
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("prompt", "select_account");
  }

  const res = NextResponse.redirect(authUrl, { status: 303 });
  const cookieBase = getCookieBase(ctx, true);
  res.cookies.set("lemedia_oauth_state", state, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oauth_verifier", verifier, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oauth_provider", provider, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oauth_mode", "login", { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oauth_link_user", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_oauth_link_return", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_login_redirect", from, { ...cookieBase, maxAge: 60 * 30 });
  return res;
}
