import { NextRequest, NextResponse } from "next/server";
import { isSecureRequest, resolveBase, resolveCookieDomain } from "@/lib/server-utils";

export type RequestContext = {
  base: string;
  secure: boolean;
  cookieDomain?: string;
  sameSite: "none" | "lax";
};

export function getRequestContext(req: NextRequest): RequestContext {
  const base = resolveBase(req);
  const secure = isSecureRequest(req);
  const cookieDomain = resolveCookieDomain(base, req);
  const sameSite: "none" | "lax" = "lax";
  return { base, secure, cookieDomain, sameSite };
}

export function getCookieBase(ctx: RequestContext, httpOnly = true) {
  return {
    httpOnly,
    sameSite: ctx.sameSite,
    secure: ctx.secure,
    path: "/",
    ...(ctx.cookieDomain ? { domain: ctx.cookieDomain } : {})
  };
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64(bytes);
}

export function ensureCsrfCookie(req: NextRequest, res: NextResponse, ctx: RequestContext) {
  const existing = req.cookies.get("lemedia_csrf")?.value;
  if (existing) return { res, token: existing };
  const token = createCsrfToken();
  res.cookies.set("lemedia_csrf", token, { ...getCookieBase(ctx, false), maxAge: 60 * 60 * 24 });
  return { res, token };
}

export function isSameOriginRequest(req: NextRequest, base: string): boolean {
  const matchesHost = (candidate: string) => {
    try {
      return new URL(candidate).host === new URL(base).host;
    } catch {
      return false;
    }
  };
  const origin = req.headers.get("origin");
  if (origin) return origin === base || matchesHost(origin);

  const referer = req.headers.get("referer");
  if (!referer) return true;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}` === base || matchesHost(referer);
  } catch {
    return false;
  }
}

export function sanitizeRelativePath(value: string | null | undefined): string {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed) return "/";
  if (trimmed.startsWith("http")) return "/";
  if (trimmed.startsWith("//") || trimmed.startsWith("\\\\")) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}
