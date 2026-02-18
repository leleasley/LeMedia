import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginPageClient } from "@/components/auth/LoginPageClient";

export const metadata = {
  title: "Login - LeMedia",
};
import { getActiveOidcProvider, getJellyfinConfig, getSetting, isSetupComplete } from "@/db";
import { verifySessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";

function sanitizeFrom(value: string | undefined | null): string {
  if (!value) return "/";
  if (value.startsWith("http")) return "/";
  if (value.startsWith("//") || value.startsWith("\\\\")) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

export default async function LoginPage() {
  // Check if setup is required - redirect to setup wizard if not complete
  const setupComplete = await isSetupComplete();
  if (!setupComplete) {
    redirect("/setup");
  }
  const cookieStore = await cookies();
  const csrfToken = cookieStore.get("lemedia_csrf")?.value;
  const sessionToken = cookieStore.get("lemedia_session")?.value ?? "";
  const existingSession = sessionToken ? await verifySessionToken(sessionToken) : null;
  const loginRedirectCookie = cookieStore.get("lemedia_login_redirect")?.value;
  const from = sanitizeFrom(loginRedirectCookie);
  const oidcConfig = await getActiveOidcProvider();
  const rawSsoEnabled = await getSetting("auth.sso_enabled");
  const ssoEnabledSetting = rawSsoEnabled === null || rawSsoEnabled === "1" || rawSsoEnabled === "true";
  const oidcEnabled = Boolean(oidcConfig && ssoEnabledSetting);
  const ssoProviderType = oidcConfig?.providerType ?? (oidcConfig?.duoApiHostname ? "duo_websdk" : "oidc");
  const jellyfinConfig = await getJellyfinConfig();
  const jellyfinEnabled = Boolean(jellyfinConfig.hostname?.trim());
  const googleOauthEnabled = Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() && process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
  const githubOauthEnabled = Boolean(process.env.GITHUB_OAUTH_CLIENT_ID?.trim() && process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim());

  if (existingSession?.username) {
    redirect(from || "/");
  }

  return (
    <LoginPageClient
      csrfToken={csrfToken}
      from={from}
      oidcEnabled={oidcEnabled}
      jellyfinEnabled={jellyfinEnabled}
      ssoProviderType={ssoProviderType}
      googleOauthEnabled={googleOauthEnabled}
      githubOauthEnabled={githubOauthEnabled}
    />
  );
}
