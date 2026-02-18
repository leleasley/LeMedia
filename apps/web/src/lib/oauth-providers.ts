import { createHash, randomBytes } from "crypto";

export type OAuthProvider = "google" | "github";

export type OAuthIdentity = {
  providerUserId: string;
  email: string | null;
  login: string | null;
};

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  scopes: string[];
  authorizeUrl: string;
  tokenUrl: string;
};

function base64Url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createPkceVerifier(): string {
  return base64Url(randomBytes(32));
}

export function createPkceChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

export function createOAuthState(): string {
  return base64Url(randomBytes(24));
}

export function getOAuthConfig(provider: OAuthProvider): OAuthConfig | null {
  if (provider === "google") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() ?? "";
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() ?? "";
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      scopes: ["openid", "email", "profile"],
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token"
    };
  }

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    scopes: ["read:user", "user:email"],
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token"
  };
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return value === "google" || value === "github";
}

export function getOAuthCallbackPath(provider: OAuthProvider): string {
  return `/api/auth/oauth/${provider}/callback`;
}

export async function exchangeOAuthCode(input: {
  provider: OAuthProvider;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ accessToken: string; idToken?: string | null }> {
  const config = getOAuthConfig(input.provider);
  if (!config) throw new Error("OAuth provider not configured");

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code"
  });

  if (input.provider === "github") {
    body.delete("grant_type");
    body.delete("code_verifier");
  }

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: body.toString()
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description || data?.error || "Failed to exchange OAuth code");
  }

  return {
    accessToken: String(data.access_token),
    idToken: data?.id_token ? String(data.id_token) : null
  };
}

export async function fetchOAuthIdentity(provider: OAuthProvider, accessToken: string): Promise<OAuthIdentity> {
  if (provider === "google") {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.sub) {
      throw new Error("Failed to read Google profile");
    }

    return {
      providerUserId: String(data.sub),
      email: data?.email ? String(data.email).toLowerCase() : null,
      login: data?.name ? String(data.name) : null
    };
  }

  const userRes = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json"
    }
  });
  const user = await userRes.json().catch(() => ({}));
  if (!userRes.ok || !user?.id) {
    throw new Error("Failed to read GitHub profile");
  }

  let email: string | null = typeof user?.email === "string" && user.email ? String(user.email).toLowerCase() : null;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json"
      }
    });
    const emails = await emailRes.json().catch(() => []);
    if (emailRes.ok && Array.isArray(emails)) {
      const preferred = emails.find((entry: any) => entry?.primary && entry?.verified)
        || emails.find((entry: any) => entry?.verified)
        || emails[0];
      if (preferred?.email) {
        email = String(preferred.email).toLowerCase();
      }
    }
  }

  return {
    providerUserId: String(user.id),
    email,
    login: user?.login ? String(user.login) : null
  };
}
