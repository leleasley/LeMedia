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

export async function fetchJellyfinServerInfo(
  baseUrl: string,
  apiKey: string
): Promise<{ id: string | null; name: string | null }> {
  const normalized = baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${normalized}/System/Info`, {
      headers: { "X-Emby-Token": apiKey }
    });
    if (!res.ok) return { id: null, name: null };
    const payload = await res.json().catch(() => ({}));
    const serverId = String(payload?.Id ?? payload?.ServerId ?? "").trim();
    const serverName = String(payload?.ServerName ?? payload?.Name ?? "").trim();
    return {
      id: serverId || null,
      name: serverName || null
    };
  } catch {
    return { id: null, name: null };
  }
}

export type JellyfinLibrary = {
  id: string;
  name: string;
  type: "movie" | "show";
};

const EXCLUDED_COLLECTION_TYPES = new Set([
  "music",
  "books",
  "musicvideos",
  "homevideos",
  "boxsets",
]);

function mapJellyfinLibraries(
  items: Array<{ Id: string; Name: string; Type?: string; CollectionType?: string }>
): JellyfinLibrary[] {
  return items
    .filter((item) => item.Type === "CollectionFolder")
    .filter((item) => !EXCLUDED_COLLECTION_TYPES.has(String(item.CollectionType ?? "").toLowerCase()))
    .map((item) => ({
      id: item.Id,
      name: item.Name,
      type: String(item.CollectionType ?? "").toLowerCase() === "movies" ? "movie" : "show",
    }));
}

export async function listJellyfinLibraries(baseUrl: string, apiKey: string): Promise<JellyfinLibrary[]> {
  const normalized = baseUrl.replace(/\/+$/, "");
  try {
    const res = await fetch(`${normalized}/Library/MediaFolders`, {
      headers: { Accept: "application/json", "X-Emby-Token": apiKey }
    });
    if (res.ok) {
      const payload = await res.json().catch(() => ({}));
      const items = Array.isArray(payload?.Items) ? payload.Items : [];
      return mapJellyfinLibraries(items);
    }
  } catch {
    // fall through to fallback
  }

  try {
    const res = await fetch(`${normalized}/Users/Me/Views`, {
      headers: { Accept: "application/json", "X-Emby-Token": apiKey }
    });
    if (!res.ok) return [];
    const payload = await res.json().catch(() => ({}));
    const items = Array.isArray(payload?.Items) ? payload.Items : [];
    return mapJellyfinLibraries(items);
  } catch {
    return [];
  }
}

/**
 * Generate a consistent device ID for LeMedia admin operations
 */
export async function getJellyfinDeviceId(): Promise<string> {
  return Buffer.from('BOT_LeMedia').toString('base64');
}

type JellyfinAuthExtendedResponse = {
  User: {
    Id: string;
    Name: string;
    ServerId?: string;
    Policy?: {
      IsAdministrator?: boolean;
    };
  };
  AccessToken: string;
  ServerId?: string;
  ServerName?: string;
};

export type JellyfinAuthResult = {
  userId: string;
  username: string;
  accessToken: string;
  serverId?: string;
  serverName?: string;
  isAdmin: boolean;
};

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

/**
 * Authenticate with Jellyfin and return extended information including serverId
 */
export async function jellyfinAuthenticate(input: {
  baseUrl: string;
  username: string;
  password: string;
  clientIp?: string;
}): Promise<JellyfinAuthResult> {
  const deviceId = await getJellyfinDeviceId();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Emby-Authorization": `MediaBrowser Client="LeMedia", Device="LeMedia", DeviceId="${deviceId}", Version="0.1.0"`
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
    const errorText = await res.text().catch(() => "");
    throw new Error(`Login failed (${res.status}): ${errorText || "Invalid credentials"}`);
  }
  const payload = (await res.json()) as JellyfinAuthExtendedResponse;
  if (!payload?.User?.Id || !payload?.AccessToken) {
    throw new Error("Invalid Jellyfin response");
  }
  return {
    userId: payload.User.Id,
    username: payload.User.Name,
    accessToken: payload.AccessToken,
    serverId: payload.User.ServerId || payload.ServerId,
    serverName: payload.ServerName,
    isAdmin: Boolean(payload.User.Policy?.IsAdministrator)
  };
}

/**
 * Validate that the authenticated user is a Jellyfin administrator
 */
export async function validateJellyfinAdmin(baseUrl: string, accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/Users/Me`, {
      headers: {
        Accept: "application/json",
        "X-Emby-Token": accessToken
      }
    });
    if (!res.ok) return false;
    const user = await res.json();
    return Boolean(user?.Policy?.IsAdministrator);
  } catch {
    return false;
  }
}

/**
 * Create a new API key for LeMedia using the access token
 */
export async function createJellyfinApiKey(baseUrl: string, accessToken: string): Promise<string> {
  const normalized = baseUrl.replace(/\/+$/, "");

  // Create the API key
  const createRes = await fetch(`${normalized}/Auth/Keys?App=LeMedia`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-Emby-Token": accessToken
    }
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create API key (${createRes.status})`);
  }

  // Retrieve the newly created key
  const listRes = await fetch(`${normalized}/Auth/Keys`, {
    headers: {
      Accept: "application/json",
      "X-Emby-Token": accessToken
    }
  });

  if (!listRes.ok) {
    throw new Error(`Failed to retrieve API keys (${listRes.status})`);
  }

  const keys = (await listRes.json()) as { Items?: Array<{ AppName: string; AccessToken: string; DateCreated: string }> };
  const items = keys.Items ?? [];

  // Find the most recently created LeMedia key
  const lemediaKeys = items
    .filter(k => k.AppName === "LeMedia")
    .sort((a, b) => new Date(b.DateCreated).getTime() - new Date(a.DateCreated).getTime());

  if (lemediaKeys.length === 0) {
    throw new Error("API key was created but could not be retrieved");
  }

  return lemediaKeys[0].AccessToken;
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
