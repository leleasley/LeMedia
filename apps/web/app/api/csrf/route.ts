import { NextRequest, NextResponse } from "next/server";
import { createCsrfToken, getCookieBase, getRequestContext } from "@/lib/proxy";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  const ctx = getRequestContext(req);
  const existing = req.cookies.get("lemedia_csrf")?.value;
  if (existing) {
    return jsonResponseWithETag(req, { ok: true, token: existing });
  }

  const token = createCsrfToken();
  const res = jsonResponseWithETag(req, { ok: true, token });
  res.cookies.set("lemedia_csrf", token, { ...getCookieBase(ctx, false), maxAge: 60 * 60 * 24 });
  return res;
}
