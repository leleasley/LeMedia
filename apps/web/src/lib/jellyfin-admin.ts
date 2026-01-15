"use server";

import { decryptSecret } from "@/lib/encryption";
import { getJellyfinConfig } from "@/db";

type JellyfinUser = {
  Id: string;
  Name: string;
};

export type JellyfinUserSummary = {
  id: string;
  username: string;
};

export type JellyfinLoginResult = {
  userId: string;
  username: string;
  accessToken: string;
};

type JellyfinAuthResponse = {
  User: { Id: string; Name: string };
  AccessToken: string;
};

export async function getJellyfinBaseUrl() {
  const config = await getJellyfinConfig();
  const host = config.hostname.trim();
  if (!host) return null;
  const port = config.port ? `:${config.port}` : "";
  const base = config.urlBase.trim();
  const path = base ? (base.startsWith("/") ? base : `/${base}`) : "";
  return `${config.useSsl ? "https" : "http"}://${host}${port}${path}`;
}

export async function getJellyfinApiKey() {
  const config = await getJellyfinConfig();
  if (!config.apiKeyEncrypted) return null;
  try {
    return decryptSecret(config.apiKeyEncrypted);
  } catch {
    return null;
  }
}

export async function jellyfinLogin(input: {
  baseUrl: string;
  username: string;
  password: string;
  deviceId: string;
  clientIp?: string;
}): Promise<JellyfinLoginResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Emby-Authorization": `MediaBrowser Client="LeMedia", Device="LeMedia", DeviceId="${input.deviceId}", Version="0.1.0"`
  };
  if (input.clientIp) {
    headers["X-Forwarded-For"] = input.clientIp;
  }
  const res = await fetch(`${input.baseUrl.replace(/\/+$/, "")}/Users/AuthenticateByName`, {
    method: "POST",
    headers,
    body: JSON.stringify({ Username: input.username, Pw: input.password })
  });
  if (!res.ok) {
    throw new Error(`Login failed (${res.status})`);
  }
  const payload = (await res.json()) as JellyfinAuthResponse;
  if (!payload?.User?.Id || !payload?.AccessToken) {
    throw new Error("Invalid Jellyfin response");
  }
  return {
    userId: payload.User.Id,
    username: payload.User.Name,
    accessToken: payload.AccessToken
  };
}

export async function listJellyfinUsers(baseUrl: string, apiKey: string): Promise<JellyfinUserSummary[]> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/Users`, {
    headers: {
      Accept: "application/json",
      "X-Emby-Token": apiKey
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to load users (${res.status})`);
  }
  const payload = (await res.json()) as JellyfinUser[];
  return (Array.isArray(payload) ? payload : []).map(user => ({
    id: user.Id,
    username: user.Name
  }));
}

/**
 * Search Jellyfin library for a movie by TMDB ID
 */
export async function searchJellyfinMovie(tmdbId: number): Promise<{
  inLibrary: boolean;
  itemId?: string;
  name?: string;
} | null> {
  try {
    const baseUrl = await getJellyfinBaseUrl();
    const apiKey = await getJellyfinApiKey();
    
    if (!baseUrl || !apiKey) return null;

    const res = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/Items?` +
        new URLSearchParams({
          Recursive: "true",
          IncludeItemTypes: "Movie",
          AnyProviderIdEquals: `tmdb.${tmdbId}`,
          Fields: "ProviderIds",
          Limit: "1",
        }),
      {
        headers: {
          Accept: "application/json",
          "X-Emby-Token": apiKey,
        },
      }
    );

    if (!res.ok) return null;

    const data = (await res.json()) as { Items?: Array<{ Id: string; Name: string; ProviderIds?: Record<string, string> }> };
    const items = data.Items ?? [];

    // Strict verification to ensure we don't get fuzzy matches
    const match = items.find(item => {
        const pid = item.ProviderIds?.Tmdb || item.ProviderIds?.tmdb;
        return pid == String(tmdbId);
    });

    if (match) {
      return {
        inLibrary: true,
        itemId: match.Id,
        name: match.Name,
      };
    }

    return { inLibrary: false };
  } catch (err) {
    console.error("[Jellyfin] Movie search failed:", err);
    return null;
  }
}

/**
 * Search Jellyfin library for a TV series by TVDB ID
 */
export async function searchJellyfinSeries(tvdbId: number): Promise<{
  inLibrary: boolean;
  itemId?: string;
  name?: string;
} | null> {
  try {
    const baseUrl = await getJellyfinBaseUrl();
    const apiKey = await getJellyfinApiKey();
    
    if (!baseUrl || !apiKey) return null;

    const res = await fetch(
      `${baseUrl.replace(/\/+$/, "")}/Items?` +
        new URLSearchParams({
          Recursive: "true",
          IncludeItemTypes: "Series",
          AnyProviderIdEquals: `tvdb.${tvdbId}`,
          Fields: "ProviderIds",
          Limit: "1",
        }),
      {
        headers: {
          Accept: "application/json",
          "X-Emby-Token": apiKey,
        },
      }
    );

    if (!res.ok) return null;

    const data = (await res.json()) as { Items?: Array<{ Id: string; Name: string; ProviderIds?: Record<string, string> }> };
    const items = data.Items ?? [];

    // Strict verification
    const match = items.find(item => {
        const pid = item.ProviderIds?.Tvdb || item.ProviderIds?.tvdb;
        return pid == String(tvdbId);
    });

    if (match) {
      return {
        inLibrary: true,
        itemId: match.Id,
        name: match.Name,
      };
    }

    return { inLibrary: false };
  } catch (err) {
    console.error("[Jellyfin] Series search failed:", err);
    return null;
  }
}
