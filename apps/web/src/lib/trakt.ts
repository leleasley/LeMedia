import "server-only";

const TRAKT_API_BASE = "https://api.trakt.tv";

export type TraktTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  created_at: number;
  scope?: string;
  token_type?: string;
};

export type TraktUserProfile = {
  username: string;
  name?: string | null;
  ids?: Record<string, any>;
};

export function buildTraktAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(`${TRAKT_API_BASE}/oauth/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  return url.toString();
}

export function getTraktExpiresAt(token: TraktTokenResponse): string | null {
  if (!token?.created_at || !token?.expires_in) return null;
  const seconds = token.created_at + token.expires_in;
  return new Date(seconds * 1000).toISOString();
}

async function traktFetch(path: string, init: RequestInit) {
  const url = path.startsWith("http") ? path : `${TRAKT_API_BASE}${path}`;
  const res = await fetch(url, { ...init, cache: "no-store" });
  return res;
}

export async function exchangeTraktCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<TraktTokenResponse> {
  const res = await traktFetch("/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      code: input.code,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
      grant_type: "authorization_code"
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Trakt token exchange failed (${res.status}): ${body || res.statusText}`);
  }
  return (await res.json()) as TraktTokenResponse;
}

export async function refreshTraktToken(input: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<TraktTokenResponse> {
  const res = await traktFetch("/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      refresh_token: input.refreshToken,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      grant_type: "refresh_token"
    })
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Trakt token refresh failed (${res.status}): ${body || res.statusText}`);
  }
  return (await res.json()) as TraktTokenResponse;
}

function buildAuthHeaders(clientId: string, accessToken: string) {
  return {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": clientId,
    Authorization: `Bearer ${accessToken}`
  } as Record<string, string>;
}

export async function fetchTraktUserProfile(accessToken: string, clientId: string): Promise<TraktUserProfile> {
  const res = await traktFetch("/users/me", {
    method: "GET",
    headers: buildAuthHeaders(clientId, accessToken)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Trakt user lookup failed (${res.status}): ${body || res.statusText}`);
  }
  return (await res.json()) as TraktUserProfile;
}

export async function fetchTraktWatchlist(input: {
  accessToken: string;
  clientId: string;
  type: "movies" | "shows";
}): Promise<Array<{ tmdbId: number }>> {
  const res = await traktFetch(`/sync/watchlist/${input.type}`, {
    method: "GET",
    headers: buildAuthHeaders(input.clientId, input.accessToken)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Trakt watchlist fetch failed (${res.status}): ${body || res.statusText}`);
  }
  const data = (await res.json()) as Array<any>;
  const items = Array.isArray(data) ? data : [];
  return items
    .map(item => {
      const ids = input.type === "movies" ? item?.movie?.ids : item?.show?.ids;
      const tmdbId = ids?.tmdb ? Number(ids.tmdb) : null;
      if (!tmdbId || Number.isNaN(tmdbId)) return null;
      return { tmdbId };
    })
    .filter(Boolean) as Array<{ tmdbId: number }>;
}
