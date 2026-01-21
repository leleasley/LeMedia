import { getJellyfinConfig } from "@/db";

function buildBaseUrl(config: { hostname: string; port: number; useSsl: boolean; urlBase: string; externalUrl: string }) {
  const explicit = (config.externalUrl ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const host = config.hostname?.trim();
  if (!host) return "";
  const port = config.port ? `:${config.port}` : "";
  const basePath = config.urlBase?.trim() ?? "";
  const normalizedPath = basePath ? (basePath.startsWith("/") ? basePath : `/${basePath}`) : "";
  return `${config.useSsl ? "https" : "http"}://${host}${port}${normalizedPath}`;
}

export async function getJellyfinExternalBaseUrl() {
  const config = await getJellyfinConfig();
  const base = buildBaseUrl(config);
  return base || null;
}

export async function getJellyfinPlayUrl(itemId?: string | null, mediaType?: "movie" | "tv") {
  if (!itemId) return null;
  const config = await getJellyfinConfig();
  const base = buildBaseUrl(config);
  if (!base) return null;
  const serverId = (config.serverId ?? "").trim();
  const serverIdParam = serverId ? `&serverId=${encodeURIComponent(serverId)}` : "";
  const context = mediaType === "tv" ? "tvshows" : "home";
  // Modern Jellyfin uses # instead of index.html#!/
  return `${base}/web/#/details?id=${encodeURIComponent(itemId)}&context=${context}${serverIdParam}`;
}

export async function getJellyfinDetailsUrl(itemId?: string | null) {
  if (!itemId) return null;
  const config = await getJellyfinConfig();
  const base = buildBaseUrl(config);
  if (!base) return null;
  const serverId = (config.serverId ?? "").trim();
  const serverIdParam = serverId ? `&serverId=${encodeURIComponent(serverId)}` : "";
  return `${base}/web/index.html#!/details?id=${encodeURIComponent(itemId)}${serverIdParam}`;
}

export async function getJellyfinSearchUrl(query?: string | null) {
  const q = (query ?? "").trim();
  if (!q) return null;
  const config = await getJellyfinConfig();
  const base = buildBaseUrl(config);
  if (!base) return null;
  return `${base}/web/index.html#!/search?query=${encodeURIComponent(q)}`;
}
