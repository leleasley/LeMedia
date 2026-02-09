import { NextRequest, NextResponse } from "next/server";
import { Client } from "@duosecurity/duo_universal";
import { getActiveOidcProvider } from "@/db";
import { getCookieBase, getRequestContext, sanitizeRelativePath } from "@/lib/proxy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyTurnstileToken } from "@/lib/turnstile";

export async function GET(req: NextRequest) {
  const config = await getActiveOidcProvider();
  const ctx = getRequestContext(req);
  const base = ctx.base;
  const from = sanitizeRelativePath(req.nextUrl.searchParams.get("from"));
  const turnstileToken = req.nextUrl.searchParams.get("turnstile_token") ?? "";
  const username = (req.nextUrl.searchParams.get("username") ?? "").trim();
  const ip = getClientIp(req);
  const rate = checkRateLimit(`duo_login:${ip}`, { windowMs: 60 * 1000, max: 20 });

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

  const isDuoProvider = config?.providerType === "duo_websdk" || /duo/i.test(config?.name ?? "") || !!config?.duoApiHostname;
  if (!config || !isDuoProvider || !config.clientId || !config.clientSecret || !config.duoApiHostname) {
    const url = new URL("/login", base);
    url.searchParams.set("error", "Duo Web SDK is not configured");
    return NextResponse.redirect(url);
  }

  if (!username) {
    const url = new URL("/login", base);
    url.searchParams.set("error", "Enter your Duo username to continue");
    return NextResponse.redirect(url);
  }

  const redirectUrl = config.redirectUri || `${base}/api/auth/duo/callback`;
  const client = new Client({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    apiHost: config.duoApiHostname,
    redirectUrl
  });

  try {
    const status = await client.healthCheck();
    if (status?.stat !== "OK") {
      const url = new URL("/login", base);
      url.searchParams.set("error", "Unable to contact Duo");
      return NextResponse.redirect(url);
    }
  } catch {
    const url = new URL("/login", base);
    url.searchParams.set("error", "Unable to contact Duo");
    return NextResponse.redirect(url);
  }

  const state = client.generateState();
  let authUrl: string;
  try {
    authUrl = await client.createAuthUrl(username, state);
  } catch {
    const url = new URL("/login", base);
    url.searchParams.set("error", "Unable to start Duo authentication");
    return NextResponse.redirect(url);
  }

  const res = NextResponse.redirect(authUrl, { status: 303 });
  const cookieBase = getCookieBase(ctx, true);
  res.cookies.set("lemedia_duo_state", state, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_duo_username", username, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_duo_provider", config.id, { ...cookieBase, maxAge: 60 * 30 });
  res.cookies.set("lemedia_login_redirect", from, { ...cookieBase, maxAge: 60 * 30 });
  return res;
}
