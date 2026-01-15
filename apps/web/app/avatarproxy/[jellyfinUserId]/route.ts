import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserByJellyfinUserId } from "@/db";
import { getJellyfinApiKey, getJellyfinBaseUrl } from "@/lib/jellyfin-admin";
import { ImageProxy } from "@/lib/imageproxy";

type Context = { params: Promise<{ jellyfinUserId: string }> };

const fallbackAvatarSvg = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">',
  '<rect width="64" height="64" rx="32" fill="#1f2937"/>',
  '<circle cx="32" cy="26" r="12" fill="#9ca3af"/>',
  '<path d="M14 54c3-10 12-16 18-16s15 6 18 16" fill="#9ca3af"/>',
  '</svg>'
].join("");

function fallbackAvatarResponse() {
  return new NextResponse(fallbackAvatarSvg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      Expires: new Date(Date.now() + 31536000 * 1000).toUTCString()
    }
  });
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
    Expires: new Date(Date.now() + cacheSeconds * 1000).toUTCString()
  };
  if (etag) headers.ETag = etag;
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}

export async function GET(_req: NextRequest, context: Context) {
  const resolvedParams = await context.params;
  const jellyfinUserId = resolvedParams.jellyfinUserId;
  if (!jellyfinUserId) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  const currentUser = await requireUser();
  if (currentUser instanceof NextResponse) return currentUser;

  const [owner, baseUrl, apiKey] = await Promise.all([
    !currentUser.isAdmin ? getUserByJellyfinUserId(jellyfinUserId) : Promise.resolve(null),
    getJellyfinBaseUrl(),
    getJellyfinApiKey()
  ]);

  if (!currentUser.isAdmin) {
    if (!owner || owner.username !== currentUser.username) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "Jellyfin not configured" }, { status: 400 });
  }

  try {
    const jellyfinProxy = new ImageProxy("jellyfin-avatar", baseUrl.replace(/\/+$/, ""), {
      cacheVersion: 1,
      headers: { "X-Emby-Token": apiKey }
    });
    const path = `/Users/${jellyfinUserId}/Images/Primary?quality=90`;
    const result = await jellyfinProxy.getImage(path);
    return buildImageResponse(result.imageBuffer, result.meta.extension, result.meta.curRevalidate, result.meta.etag);
  } catch {
    return fallbackAvatarResponse();
  }
}
