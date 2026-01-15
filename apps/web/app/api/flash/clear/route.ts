import { NextRequest, NextResponse } from "next/server";
import { getCookieBase, getRequestContext } from "@/lib/proxy";
import { requireCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  const ctx = getRequestContext(req);
  const csrf = requireCsrf(req);
  if (csrf) return csrf;
  const res = NextResponse.json({ ok: true });
  const cookieBase = getCookieBase(ctx, true);
  // Clear server-side flash cookies (they are HttpOnly so client JS can't remove them)
  res.cookies.set("lemedia_flash", "", { ...cookieBase, maxAge: 0 });
  res.cookies.set("lemedia_flash_error", "", { ...cookieBase, maxAge: 0 });
  return res;
}
