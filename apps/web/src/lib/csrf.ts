import { NextRequest, NextResponse } from "next/server";
import { getRequestContext, isSameOriginRequest } from "@/lib/proxy";

export function getCsrfCookie(req: NextRequest): string | null {
  return req.cookies.get("lemedia_csrf")?.value ?? null;
}

export function getCsrfTokenFromRequest(req: NextRequest): string | null {
  return (
    req.headers.get("x-csrf-token")
    || req.headers.get("x-xsrf-token")
    || null
  );
}

export function isValidCsrfToken(req: NextRequest, provided: string | null | undefined): boolean {
  const cookie = getCsrfCookie(req);
  if (!cookie || !provided) return false;
  return cookie === provided;
}

export function requireCsrf(req: NextRequest): NextResponse | null {
  const ctx = getRequestContext(req);
  if (!isSameOriginRequest(req, ctx.base)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }
  const token = getCsrfTokenFromRequest(req);
  if (!isValidCsrfToken(req, token)) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }
  return null;
}
