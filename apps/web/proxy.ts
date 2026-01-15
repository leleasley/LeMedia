import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

export function proxy(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) return NextResponse.next();

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|manifest.json|icon-.*|apple-touch-icon.*|robots.txt|sitemap.xml).*)",
  ],
};
