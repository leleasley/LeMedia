import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/v1/lists/[listId]/cover/image
 * Serve the custom cover image
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const imagePath = req.nextUrl.searchParams.get("path");

    if (!imagePath) {
      return NextResponse.json({ error: "No image path provided" }, { status: 400 });
    }

    // Ensure path is relative to upload directory for security
    if (imagePath.includes("..") || imagePath.startsWith("/")) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const uploadBaseDir = process.env.UPLOAD_BASE_DIR || "/app/uploads";
    const fullPath = path.join(uploadBaseDir, imagePath);

    try {
      const data = await readFile(fullPath);

      // Determine MIME type from file extension
      const ext = path.extname(imagePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
      };

      const mimeType = mimeTypes[ext] || "application/octet-stream";

      return new NextResponse(data, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=31536000, immutable",
          "Content-Length": data.length.toString(),
        },
      });
    } catch (err) {
      if ((err as any)?.code === "ENOENT") {
        return NextResponse.json({ error: "Image not found" }, { status: 404 });
      }
      throw err;
    }
  } catch (err) {
    console.error("Error serving image:", err);
    return NextResponse.json({ error: "Failed to serve image" }, { status: 500 });
  }
}
