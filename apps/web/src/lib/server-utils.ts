import { NextRequest } from "next/server";

function getForwardedHost(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-host");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  const host = req.headers.get("host") || req.nextUrl.host;
  return host || undefined;
}

function stripPort(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end > -1 ? trimmed.slice(1, end) : trimmed;
  }
  return trimmed.split(":")[0] ?? trimmed;
}

function isIpv4(host: string) {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
}

function isIpAddress(host: string) {
  if (!host) return false;
  const h = stripPort(host);
  if (!h) return false;
  if (h.includes(":")) return true; // basic IPv6 heuristic
  return isIpv4(h);
}

function getForwardedProto(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  const proto = req.nextUrl.protocol.replace(":", "");
  return proto || undefined;
}

export function resolveBase(req: NextRequest): string {
  const rawHost = getForwardedHost(req) || req.nextUrl.host;
  const proto = getForwardedProto(req) || "http";
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) {
    if (rawHost) {
      const reqHost = stripPort(rawHost).toLowerCase();
      const baseHost = (() => {
        try {
          return new URL(explicit).hostname.toLowerCase();
        } catch {
          return "";
        }
      })();
      const matchesBase = baseHost && (reqHost === baseHost || reqHost.endsWith(`.${baseHost}`));
      if (!matchesBase || reqHost === "localhost" || isIpAddress(rawHost)) {
        return `${proto}://${rawHost}`;
      }
    }
    return explicit.replace(/\/+$/, "");
  }
  const host = rawHost;
  return `${proto}://${host}`;
}

export function resolveCookieDomain(base: string, req?: NextRequest): string | undefined {
  let baseHost: string | undefined;
  try {
    const url = new URL(base);
    baseHost = url.hostname;
  } catch {
    baseHost = undefined;
  }
  if (baseHost && isIpAddress(baseHost)) return undefined;
  if (!req) return baseHost;

  const host = getForwardedHost(req) || req.nextUrl.host;
  const reqHost = host ? host.split(":")[0] : "";
  if (!reqHost) return baseHost;
  if (baseHost) {
    const baseLower = baseHost.toLowerCase();
    const reqLower = reqHost.toLowerCase();
    if (baseLower === reqLower || reqLower.endsWith(`.${baseLower}`)) {
      return baseHost;
    }
    return undefined;
  }
  return baseHost ?? reqHost;
}

export function isSecureRequest(req: NextRequest): boolean {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) {
    try {
      const host = getForwardedHost(req) || req.nextUrl.host;
      if (host && isIpAddress(host)) {
        const proto = getForwardedProto(req) || "";
        return (proto || "").toLowerCase() === "https";
      }
      if (host) {
        const reqHost = host.split(":")[0]?.toLowerCase();
        const baseHost = new URL(explicit).hostname.toLowerCase();
        const matchesBase = reqHost === baseHost || reqHost.endsWith(`.${baseHost}`);
        if (!matchesBase || reqHost === "localhost") {
          const proto = getForwardedProto(req) || "";
          return (proto || "").toLowerCase() === "https";
        }
      }
      return new URL(explicit).protocol === "https:";
    } catch {
      // ignore and fall back
    }
  }
  const proto = getForwardedProto(req) || "";
  return (proto || "").toLowerCase() === "https";
}

export function resolveTotpIssuer(): string {
  const explicit = process.env.TOTP_ISSUER?.trim();
  if (explicit) return explicit;

  const base = process.env.APP_BASE_URL?.trim();
  if (base) {
    try {
      return new URL(base).hostname;
    } catch {
      // ignore and fall back
    }
  }

  return process.env.NEXT_PUBLIC_APP_NAME?.trim() || "LeMedia";
}

export function resolvePublicBaseUrl(req: NextRequest): string {
  const explicit = process.env.APP_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  return resolveBase(req).replace(/\/+$/, "");
}
