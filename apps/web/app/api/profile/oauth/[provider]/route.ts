import { NextRequest, NextResponse } from "next/server";
import { getUser, requireUser } from "@/auth";
import { getUserWithHash, unlinkUserOAuthAccount } from "@/db";
import { logAuditEvent } from "@/lib/audit-log";
import {
  createOAuthState,
  createPkceChallenge,
  createPkceVerifier,
  getOAuthCallbackPath,
  getOAuthConfig,
  isOAuthProvider,
  type OAuthProvider
} from "@/lib/oauth-providers";
import { getCookieBase, getRequestContext, sanitizeRelativePath } from "@/lib/proxy";
import { getClientIp } from "@/lib/rate-limit";
import { requireCsrf } from "@/lib/csrf";
import { verifyMfaCode } from "@/lib/mfa-reauth";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { provider: rawProvider } = await context.params;
  if (!isOAuthProvider(rawProvider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider" }, { status: 404 });
  }
  const provider: OAuthProvider = rawProvider;

  const body = await req.json().catch(() => ({}));
  const mfaCode = typeof body?.mfaCode === "string" ? body.mfaCode : "";
  const returnTo = sanitizeRelativePath(typeof body?.returnTo === "string" ? body.returnTo : null) || "/settings/profile/linked";

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const mfaCheck = verifyMfaCode(dbUser.mfa_secret, mfaCode);
  if (!mfaCheck.ok) {
    return NextResponse.json({ error: mfaCheck.message }, { status: 400 });
  }

  const config = getOAuthConfig(provider);
  if (!config) {
    return NextResponse.json({ error: `${provider === "google" ? "Google" : "GitHub"} linking is not configured` }, { status: 400 });
  }

  const ctx = getRequestContext(req);
  const base = ctx.base;
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

  const res = NextResponse.json({ url: authUrl.toString() });
  const cookieBase = getCookieBase(ctx, true);
  res.cookies.set("lemedia_oauth_state", state, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oauth_verifier", verifier, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oauth_provider", provider, { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oauth_mode", "link", { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oauth_link_user", String(dbUser.id), { ...cookieBase, maxAge: 60 * 10 });
  res.cookies.set("lemedia_oauth_link_return", returnTo, { ...cookieBase, maxAge: 60 * 10 });
  return res;
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const appUser = await getUser().catch(() => null);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { provider: rawProvider } = await context.params;
  if (!isOAuthProvider(rawProvider)) {
    return NextResponse.json({ error: "Unsupported OAuth provider" }, { status: 404 });
  }
  const provider: OAuthProvider = rawProvider;

  const body = await req.json().catch(() => ({}));
  const mfaCode = typeof body?.mfaCode === "string" ? body.mfaCode : "";

  const dbUser = await getUserWithHash(appUser.username);
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const mfaCheck = verifyMfaCode(dbUser.mfa_secret, mfaCode);
  if (!mfaCheck.ok) {
    return NextResponse.json({ error: mfaCheck.message }, { status: 400 });
  }

  await unlinkUserOAuthAccount(dbUser.id, provider);

  await logAuditEvent({
    action: "user.updated",
    actor: dbUser.username,
    metadata: { oauthProvider: provider, oauthAction: "unlinked" },
    ip: getClientIp(req)
  });

  return NextResponse.json({ linked: false });
}
