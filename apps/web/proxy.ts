import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const MAX_BODY_SIZE = 1024 * 1024; // 1MB
const API_V1_PREFIX = "/api/v1/";
const API_V1_SUNSET = "Wed, 30 Sep 2026 23:59:59 GMT";

function applyApiV1DeprecationHeaders(request: NextRequest, response: NextResponse) {
  if (!request.nextUrl.pathname.startsWith(API_V1_PREFIX)) return response;

  const successorPath = request.nextUrl.pathname.replace(/^\/api\/v1\//, "/api/");
  const successorUrl = `${request.nextUrl.origin}${successorPath}${request.nextUrl.search}`;
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", API_V1_SUNSET);
  response.headers.set("Link", `<${successorUrl}>; rel=\"successor-version\"`);
  return response;
}

export function proxy(request: NextRequest) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_SIZE) {
    const response = NextResponse.json({ error: "Request body too large" }, { status: 413 });
    return applyApiV1DeprecationHeaders(request, response);
  }

  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) {
    const response = NextResponse.next();
    return applyApiV1DeprecationHeaders(request, response);
  }

  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return applyApiV1DeprecationHeaders(request, response);
}

export const config = {
  matcher: [
    "/((?!_next|favicon.ico|manifest.json|icon-.*|apple-touch-icon.*|robots.txt|sitemap.xml).*)",
  ],
};
