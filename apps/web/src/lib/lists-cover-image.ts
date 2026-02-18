import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

type ListCoverRecord = {
  userId: number;
  isPublic: boolean;
  customCoverImagePath: string | null;
};

type ListCoverDeps = {
  getCustomListById: (listId: number) => Promise<ListCoverRecord | null>;
  resolveOptionalUserId: () => Promise<number | null>;
  readFile: (fullPath: string) => Promise<Buffer>;
  uploadBaseDir?: string;
};

export const defaultListCoverDeps = {
  readFile,
};

export async function handleListCoverImageRequest(
  listId: string,
  deps: ListCoverDeps
): Promise<NextResponse> {
  const listIdNum = parseInt(listId, 10);
  if (isNaN(listIdNum)) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const list = await deps.getCustomListById(listIdNum);
  if (!list || !list.customCoverImagePath) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const viewerId = await deps.resolveOptionalUserId();
  const canView = list.isPublic || (viewerId !== null && Number(list.userId) === viewerId);
  if (!canView) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  const imagePath = list.customCoverImagePath;
  if (imagePath.includes("..") || imagePath.startsWith("/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const uploadBaseDir = deps.uploadBaseDir || process.env.UPLOAD_BASE_DIR || "/app/uploads";
  const fullPath = path.join(uploadBaseDir, imagePath);

  try {
    const data = await deps.readFile(fullPath);

    const ext = path.extname(imagePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
    };

    const mimeType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(new Uint8Array(data), {
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
}
