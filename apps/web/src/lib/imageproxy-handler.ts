import { NextRequest, NextResponse } from "next/server";
import { ImageProxy } from "@/lib/imageproxy";
import { requireUser } from "@/auth";
import { getJellyfinApiKey, getJellyfinBaseUrl } from "@/lib/jellyfin-admin";

type ParamsInput =
  | { type: string; path: string[] }
  | Promise<{ type: string; path: string[] }>;

const tmdbProxy = new ImageProxy("tmdb", "https://image.tmdb.org", {
  cacheVersion: 1,
  rateLimitOptions: { maxRequests: 50, perMilliseconds: 1000 },
});

const tvdbProxy = new ImageProxy("tvdb", "https://artworks.thetvdb.com", {
  cacheVersion: 1,
  rateLimitOptions: { maxRequests: 20, perMilliseconds: 1000 },
});

function joinPath(pathSegments: string[], search: string) {
  const joined = pathSegments.join("/");
  const safe = joined.startsWith("/") ? joined : `/${joined}`;
  return `${safe}${search || ""}`;
}

function hasPathTraversal(pathSegments: string[]) {
  return pathSegments.some(segment => segment.includes(".."));
}

function isValidJellyfinPath(pathSegments: string[]) {
  if (pathSegments.length < 4) return false;
  if (pathSegments[0] !== "Items") return false;
  if (pathSegments[2] !== "Images") return false;
  const id = pathSegments[1] || "";
  if (!/^[A-Za-z0-9-]+$/.test(id)) return false;
  return true;
}

function resolveContentType(extension: string | null) {
  if (!extension) return "image/jpeg";
  const normalized = extension.toLowerCase();
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "png") return "image/png";
  if (normalized === "webp") return "image/webp";
  if (normalized === "gif") return "image/gif";
  if (normalized === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function buildImageResponse(buffer: Buffer, extension: string | null, maxAge: number, etag?: string) {
  const contentType = resolveContentType(extension);
  const cacheSeconds = Math.max(maxAge, 31536000);
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": `public, max-age=${cacheSeconds}, s-maxage=${cacheSeconds}, immutable`,
    Expires: new Date(Date.now() + cacheSeconds * 1000).toUTCString(),
  };
  if (etag) headers.ETag = etag;
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}

export async function handleImageProxyRequest(req: NextRequest, params: ParamsInput) {
  const resolved = await Promise.resolve(params);
  const type = (resolved.type || "").toLowerCase();
  const pathSegments = Array.isArray(resolved.path) ? resolved.path : [];
  if (!type || pathSegments.length === 0) {
    return NextResponse.json({ error: "Invalid image proxy request" }, { status: 400 });
  }
  if (hasPathTraversal(pathSegments)) {
    return NextResponse.json({ error: "Invalid image path" }, { status: 400 });
  }

  const search = req.nextUrl.search;
  const requestPath = joinPath(pathSegments, search);

  try {
    if (type === "tmdb") {
      const result = await tmdbProxy.getImage(requestPath);
      return buildImageResponse(result.imageBuffer, result.meta.extension, result.meta.curRevalidate, result.meta.etag);
    }

    if (type === "tvdb") {
      const result = await tvdbProxy.getImage(requestPath);
      return buildImageResponse(result.imageBuffer, result.meta.extension, result.meta.curRevalidate, result.meta.etag);
    }

    if (type === "jellyfin") {
      const user = await requireUser();
      if (user instanceof NextResponse) return user;
      if (!isValidJellyfinPath(pathSegments)) {
        return NextResponse.json({ error: "Invalid Jellyfin image path" }, { status: 400 });
      }

      const baseUrl = await getJellyfinBaseUrl();
      const apiKey = await getJellyfinApiKey();
      if (!baseUrl || !apiKey) {
        return NextResponse.json({ error: "Jellyfin not configured" }, { status: 400 });
      }

      const jellyfinProxy = new ImageProxy("jellyfin", baseUrl.replace(/\/+$/, ""), {
        cacheVersion: 1,
        headers: { "X-Emby-Token": apiKey },
      });
      const result = await jellyfinProxy.getImage(requestPath);
      return buildImageResponse(result.imageBuffer, result.meta.extension, result.meta.curRevalidate, result.meta.etag);
    }

    return NextResponse.json({ error: "Unsupported image proxy type" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Image proxy failed" }, { status: 502 });
  }
}
