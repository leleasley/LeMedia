import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";

const UPLOAD_BASE_DIR = process.env.UPLOAD_BASE_DIR || "/app/uploads";
const LIST_COVERS_DIR = path.join(UPLOAD_BASE_DIR, "list-covers");

// Image validation constants
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MIN_IMAGE_SIZE = 1024; // 1KB
export const MIN_DIMENSION = 200; // pixels
export const MAX_DIMENSION = 5000; // pixels

export interface ImageUploadResult {
  path: string;
  size: number;
  mimeType: string;
  fileName: string;
}

/**
 * Ensure the upload directory exists
 */
export async function ensureUploadDirExists(): Promise<void> {
  try {
    await fs.mkdir(LIST_COVERS_DIR, { recursive: true });
  } catch (err) {
    if ((err as any)?.code !== "EEXIST") {
      throw err;
    }
  }
}

/**
 * Validate image file before upload
 */
export function validateImageFile(
  buffer: Buffer,
  mimeType: string,
  size: number
): { valid: boolean; error?: string } {
  // Validate MIME type
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    return { valid: false, error: `Image type not supported. Allowed types: ${ALLOWED_IMAGE_TYPES.join(", ")}` };
  }

  // Validate file size
  if (size < MIN_IMAGE_SIZE) {
    return { valid: false, error: `Image is too small. Minimum size: ${MIN_IMAGE_SIZE} bytes` };
  }
  if (size > MAX_IMAGE_SIZE) {
    return { valid: false, error: `Image is too large. Maximum size: ${(MAX_IMAGE_SIZE / 1024 / 1024).toFixed(1)}MB` };
  }

  // Validate file signature (magic bytes) for security
  if (mimeType === "image/jpeg" && !isJpegSignature(buffer)) {
    return { valid: false, error: "Invalid JPEG file" };
  }
  if (mimeType === "image/png" && !isPngSignature(buffer)) {
    return { valid: false, error: "Invalid PNG file" };
  }
  if (mimeType === "image/webp" && !isWebPSignature(buffer)) {
    return { valid: false, error: "Invalid WebP file" };
  }
  if (mimeType === "image/gif" && !isGifSignature(buffer)) {
    return { valid: false, error: "Invalid GIF file" };
  }

  return { valid: true };
}

/**
 * Check JPEG file signature
 */
function isJpegSignature(buffer: Buffer): boolean {
  // JPEG starts with FF D8 FF
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

/**
 * Check PNG file signature
 */
function isPngSignature(buffer: Buffer): boolean {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  return buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
}

/**
 * Check WebP file signature
 */
function isWebPSignature(buffer: Buffer): boolean {
  // WebP starts with RIFF ... WEBP
  return (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  );
}

/**
 * Check GIF file signature
 */
function isGifSignature(buffer: Buffer): boolean {
  // GIF starts with GIF87a or GIF89a
  return (
    buffer.length >= 6 &&
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    ((buffer[3] === 0x38 && (buffer[4] === 0x37 || buffer[4] === 0x39)) || buffer[3] === 0x38)
  );
}

/**
 * Save uploaded image to disk
 */
export async function saveUploadedImage(
  buffer: Buffer,
  mimeType: string,
  listId: number
): Promise<ImageUploadResult> {
  await ensureUploadDirExists();

  // Generate unique filename using list ID and UUID
  const uniqueId = randomUUID().slice(0, 8);
  const ext = getExtensionFromMimeType(mimeType);
  const fileName = `list-${listId}-${uniqueId}.${ext}`;
  const filePath = path.join(LIST_COVERS_DIR, fileName);

  // Save file
  await fs.writeFile(filePath, buffer);

  // Verify file was written
  const stats = await fs.stat(filePath);

  return {
    path: `list-covers/${fileName}`, // Relative path for database storage
    size: stats.size,
    mimeType,
    fileName,
  };
}

/**
 * Delete uploaded image file
 */
export async function deleteUploadedImage(imagePath: string | null): Promise<boolean> {
  if (!imagePath) return true;

  try {
    // Ensure path is relative to upload directory for security
    if (imagePath.includes("..") || imagePath.startsWith("/")) {
      logger.warn(`Invalid image path attempted for deletion: ${imagePath}`);
      return false;
    }

    const fullPath = path.join(UPLOAD_BASE_DIR, imagePath);
    await fs.unlink(fullPath);
    return true;
  } catch (err) {
    if ((err as any)?.code === "ENOENT") {
      // File doesn't exist, consider it deleted
      return true;
    }
    logger.error(`Failed to delete image: ${imagePath}`, err);
    return false;
  }
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  return extMap[mimeType] || "jpg";
}

/**
 * Get public URL for uploaded image (for serving to client)
 */
export function getImagePublicUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  // Images are served from /api/v1/lists/{id}/cover/image
  return imagePath;
}
