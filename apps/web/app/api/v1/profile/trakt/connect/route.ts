import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { requireUser } from "@/auth";
import { getTraktConfig } from "@/db";
import { buildTraktAuthorizeUrl } from "@/lib/trakt";
import { getCookieBase, getRequestContext, sanitizeRelativePath } from "@/lib/proxy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolvePublicBaseUrl } from "@/lib/server-utils";
import { encryptSecret } from "@/lib/encryption";

function randomString(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const ip = getClientIp(req);
  const rate = checkRateLimit(`trakt_connect:${ip}`, { windowMs: 60 * 1000, max: 15 });
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const config = await getTraktConfig();
  if (!config.enabled || !config.clientId || !config.clientSecret) {
    return NextResponse.json({ error: "Trakt is not configured" }, { status: 400 });
  }

  const ctx = getRequestContext(req);
  const state = randomString(16);
  const baseUrl = resolvePublicBaseUrl(req);
  let returnTo = sanitizeRelativePath(req.nextUrl.searchParams.get("returnTo"));
  if (!returnTo) {
    const referer = req.headers.get("referer");
    if (referer) {
      try {
        const refUrl = new URL(referer);
        if (refUrl.origin === baseUrl) {
          returnTo = sanitizeRelativePath(`${refUrl.pathname}${refUrl.search}`);
        }
      } catch {
        // ignore invalid referer
      }
    }
  }
  if (!returnTo) {
    returnTo = user.isAdmin ? "/admin/settings/services" : "/settings/profile/linked";
  }
  const redirectUri = config.redirectUri || `${baseUrl}/api/v1/profile/trakt/callback`;

  const statePayload = encryptSecret(JSON.stringify({
    uid: user.id,
    returnTo,
    ts: Date.now(),
    nonce: randomString(8)
  }));

  const authUrl = buildTraktAuthorizeUrl({
    clientId: config.clientId,
    redirectUri,
    state: statePayload
  });

  const res = NextResponse.redirect(authUrl, { status: 303 });
  const cookieBase = getCookieBase(ctx, true);
  const userPayload = encryptSecret(String(user.id));
  // Legacy cookies kept for backward compatibility, but state now carries user+returnTo.
  res.cookies.set("lemedia_trakt_state", state, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_trakt_return", returnTo, { ...cookieBase, maxAge: 60 * 30 });
  res.cookies.set("lemedia_trakt_user", userPayload, { ...cookieBase, maxAge: 60 * 10 });
  return res;
}
