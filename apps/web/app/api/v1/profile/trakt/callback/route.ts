import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getTraktConfig, getUserById, setTraktConfig, upsertUserTraktToken, updateUserProfile } from "@/db";
import { exchangeTraktCode, fetchTraktUserProfile, getTraktExpiresAt } from "@/lib/trakt";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { resolvePublicBaseUrl } from "@/lib/server-utils";
import { decryptSecret } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  const user = await requireUser();

  const ip = getClientIp(req);
  const rate = await checkRateLimit(`trakt_callback:${ip}`, { windowMs: 60 * 1000, max: 30 });
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const ctx = getRequestContext(req);
  const cookieBase = getCookieBase(ctx, true);
  const storedState = req.cookies.get("lemedia_trakt_state")?.value ?? "";
  const storedUser = req.cookies.get("lemedia_trakt_user")?.value ?? "";
  const storedReturn = req.cookies.get("lemedia_trakt_return")?.value ?? "";

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";

  let statePayload: { uid: number; returnTo?: string; ts?: number } | null = null;
  if (state) {
    try {
      statePayload = JSON.parse(decryptSecret(state));
    } catch {
      statePayload = null;
    }
  }

  const returnTo = statePayload?.returnTo || storedReturn || "/settings/profile/linked";
  const isAdminReturn = returnTo.startsWith("/admin/settings/services");

  const isLegacyStateValid = Boolean(state && storedState && state === storedState);
  const hasSessionUser = !(user instanceof NextResponse);
  const isStateValid =
    Boolean(code) &&
    (Boolean(statePayload?.uid) || isLegacyStateValid) &&
    (!statePayload?.ts || Date.now() - Number(statePayload.ts) < 15 * 60 * 1000);

  if (!code || (!isStateValid && !hasSessionUser)) {
    const url = new URL(returnTo, resolvePublicBaseUrl(req));
    url.searchParams.set("error", "Invalid Trakt authorization attempt");
    const res = NextResponse.redirect(url, { status: 303 });
    res.cookies.set("lemedia_trakt_state", "", { ...cookieBase, maxAge: 0 });
    res.cookies.set("lemedia_trakt_return", "", { ...cookieBase, maxAge: 0 });
    res.cookies.set("lemedia_trakt_user", "", { ...cookieBase, maxAge: 0 });
    return res;
  }

  const config = await getTraktConfig();
  if (!config.enabled || !config.clientId || !config.clientSecret) {
    const url = new URL(returnTo, resolvePublicBaseUrl(req));
    url.searchParams.set("error", "Trakt is not configured");
    const res = NextResponse.redirect(url, { status: 303 });
    res.cookies.set("lemedia_trakt_state", "", { ...cookieBase, maxAge: 0 });
    res.cookies.set("lemedia_trakt_return", "", { ...cookieBase, maxAge: 0 });
    return res;
  }

  try {
    const redirectUri = config.redirectUri || `${resolvePublicBaseUrl(req)}/api/v1/profile/trakt/callback`;
    const token = await exchangeTraktCode({
      code,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri
    });

    const profile = await fetchTraktUserProfile(token.access_token, config.clientId);
    const username = profile?.username?.trim();

    let userId: number | null = null;
    if (!(user instanceof NextResponse)) {
      userId = user.id;
    } else if (statePayload?.uid) {
      userId = Number(statePayload.uid);
    } else if (storedUser) {
      try {
        const id = Number(decryptSecret(storedUser));
        if (Number.isFinite(id)) {
          const fallbackUser = await getUserById(id);
          if (fallbackUser) userId = fallbackUser.id;
        }
      } catch {
        // ignore
      }
    }
    if (!userId) {
      const url = new URL(returnTo, resolvePublicBaseUrl(req));
      url.searchParams.set("error", "Unauthorized");
      const res = NextResponse.redirect(url, { status: 303 });
      res.cookies.set("lemedia_trakt_state", "", { ...cookieBase, maxAge: 0 });
      res.cookies.set("lemedia_trakt_return", "", { ...cookieBase, maxAge: 0 });
      res.cookies.set("lemedia_trakt_user", "", { ...cookieBase, maxAge: 0 });
      return res;
    }

    await upsertUserTraktToken({
      userId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: getTraktExpiresAt(token),
      scope: token.scope ?? null
    });

    if (username) {
      await updateUserProfile(userId, { traktUsername: username });
    }

    const shouldMarkAuthorized = isAdminReturn || (hasSessionUser && user.isAdmin);
    if (shouldMarkAuthorized) {
      const current = await getTraktConfig();
      await setTraktConfig({ ...current, appAuthorizedAt: new Date().toISOString() });
    }

    const url = new URL(returnTo, resolvePublicBaseUrl(req));
    url.searchParams.set("trakt", "linked");
    const res = NextResponse.redirect(url, { status: 303 });
    res.cookies.set("lemedia_trakt_state", "", { ...cookieBase, maxAge: 0 });
    res.cookies.set("lemedia_trakt_return", "", { ...cookieBase, maxAge: 0 });
    res.cookies.set("lemedia_trakt_user", "", { ...cookieBase, maxAge: 0 });
    return res;
  } catch (error: any) {
    const url = new URL(returnTo, resolvePublicBaseUrl(req));
    url.searchParams.set("error", error?.message ?? "Trakt authorization failed");
    const res = NextResponse.redirect(url, { status: 303 });
    res.cookies.set("lemedia_trakt_state", "", { ...cookieBase, maxAge: 0 });
    res.cookies.set("lemedia_trakt_return", "", { ...cookieBase, maxAge: 0 });
    res.cookies.set("lemedia_trakt_user", "", { ...cookieBase, maxAge: 0 });
    return res;
  }
}
