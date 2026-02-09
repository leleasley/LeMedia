"use server";

import { decryptSecret } from "@/lib/encryption";
import { getPlexConfig } from "@/db";
import { logger } from "@/lib/logger";
import { validateExternalServiceUrl } from "@/lib/url-validation";
import { XMLParser } from "fast-xml-parser";

export type PlexLibrary = {
  id: string;
  name: string;
  type: "movie" | "show";
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  attributesGroupName: "@",
  textNodeName: "#text"
});

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function getAttr(source: any, key: string): string | null {
  if (!source) return null;
  const direct = source[key];
  if (direct !== undefined && direct !== null) return String(direct);
  const attrs = source["@"];
  if (attrs && attrs[key] !== undefined && attrs[key] !== null) return String(attrs[key]);
  return null;
}

export async function getPlexBaseUrl() {
  const config = await getPlexConfig();
  const host = config.hostname.trim();
  if (!host) return null;

  if (host.includes('://')) {
    logger.error("[Plex Admin] Invalid hostname - contains protocol", { hostname: host });
    return null;
  }

  const port = config.port ? `:${config.port}` : "";
  const base = config.urlBase.trim();
  const path = base ? (base.startsWith("/") ? base : `/${base}`) : "";
  const baseUrl = `${config.useSsl ? "https" : "http"}://${host}${port}${path}`;

  try {
    const allowHttp = process.env.PLEX_ALLOW_HTTP === "true";
    const allowPrivateIPs = process.env.PLEX_ALLOW_PRIVATE_IPS === "true";
    const allowedCidrs = process.env.PLEX_ALLOWED_CIDRS?.split(",").map(part => part.trim()).filter(Boolean);
    return validateExternalServiceUrl(baseUrl, "Plex Admin", {
      allowHttp,
      allowPrivateIPs,
      allowedCidrs,
      requireHttps: !allowHttp && process.env.NODE_ENV === "production"
    });
  } catch (err) {
    logger.error("[Plex Admin] URL validation failed", err);
    return null;
  }
}

export async function getPlexToken() {
  const config = await getPlexConfig();
  if (!config.tokenEncrypted) return null;
  try {
    return decryptSecret(config.tokenEncrypted);
  } catch {
    return null;
  }
}

async function plexFetchXml(baseUrl: string, token: string, path: string): Promise<any | null> {
  const normalized = baseUrl.replace(/\/+$/, "");
  const url = new URL(normalized + path);
  url.searchParams.set("X-Plex-Token", token);
  try {
    const res = await fetch(url, { headers: { Accept: "application/xml" }, cache: "no-store" });
    if (!res.ok) return null;
    const xml = await res.text();
    return xmlParser.parse(xml);
  } catch (err) {
    logger.error("[Plex Admin] Plex XML fetch failed", { path, error: String(err) });
    return null;
  }
}

export async function fetchPlexServerInfo(
  baseUrl: string,
  token: string
): Promise<{ id: string | null; name: string | null }> {
  const identity = await plexFetchXml(baseUrl, token, "/identity");
  const identityContainer = identity?.MediaContainer ?? {};
  const serverId = getAttr(identityContainer, "machineIdentifier")?.trim() ?? "";
  const serverName = getAttr(identityContainer, "friendlyName")?.trim() ?? "";
  if (serverId || serverName) {
    return { id: serverId || null, name: serverName || null };
  }

  const root = await plexFetchXml(baseUrl, token, "/");
  const rootContainer = root?.MediaContainer ?? {};
  const rootId = getAttr(rootContainer, "machineIdentifier")?.trim() ?? "";
  const rootName = getAttr(rootContainer, "friendlyName")?.trim() ?? "";
  return { id: rootId || null, name: rootName || null };
}

export async function listPlexLibraries(baseUrl: string, token: string): Promise<PlexLibrary[]> {
  const data = await plexFetchXml(baseUrl, token, "/library/sections");
  const container = data?.MediaContainer ?? {};
  const directories = toArray(container.Directory);
  return directories
    .map((dir: any): PlexLibrary => ({
      id: getAttr(dir, "key") ?? "",
      name: getAttr(dir, "title") ?? "",
      type: (getAttr(dir, "type") ?? "").toLowerCase() === "movie" ? "movie" : "show"
    }))
    .filter((lib) => Boolean(lib.id && lib.name));
}
