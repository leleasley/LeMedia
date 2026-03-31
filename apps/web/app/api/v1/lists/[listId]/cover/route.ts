import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import {
  getCustomListAccessForUser,
  removeCustomListCoverImage,
  setCustomListCoverImage,
} from "@/db/lists";
import { getUserByUsername, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";
import {
  validateImageFile,
  saveUploadedImage,
  deleteUploadedImage,
  ensureUploadDirExists,
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
} from "@/lib/file-upload";
import { apiError, apiSuccess } from "@/lib/api-contract";

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) {
    throw new Error("Unauthorized");
  }
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

/**
 * POST /api/v1/lists/[listId]/cover
 * Upload a custom cover image for a list
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const { listId } = await params;
    const listIdNum = parseInt(listId, 10);

    if (isNaN(listIdNum)) {
      return apiError("Invalid list ID", { status: 400 });
    }

    const list = await getCustomListAccessForUser(listIdNum, userId);
    if (!list) {
      return apiError("List not found", { status: 404 });
    }
    if (!list.canEdit) {
      return apiError("Forbidden", { status: 403 });
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("image") as File | null;

    if (!file) {
      return apiError("No image provided", { status: 400 });
    }

    if (!file.type || !ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return apiError(`Invalid image type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(", ")}`, { status: 400 });
    }

    if (file.size > MAX_IMAGE_SIZE) {
      return apiError(`Image is too large. Maximum size: ${(MAX_IMAGE_SIZE / 1024 / 1024).toFixed(1)}MB`, { status: 400 });
    }

    // Read file buffer
    const buffer = await file.arrayBuffer();
    const bufferData = Buffer.from(buffer);

    // Validate image file
    const validation = validateImageFile(bufferData, file.type, file.size);
    if (!validation.valid) {
      return apiError(validation.error || "Invalid image", { status: 400 });
    }

    // Ensure upload directory exists
    await ensureUploadDirExists();

    // Save the image
    const uploadResult = await saveUploadedImage(bufferData, file.type, listIdNum);

    // Update database and get old image path for cleanup
    const oldImagePath = list.customCoverImagePath;

    // Set the new image
    const updated = await setCustomListCoverImage(
      listIdNum,
      userId,
      uploadResult.path,
      uploadResult.size,
      uploadResult.mimeType
    );
    if (!updated) {
      return apiError("Forbidden", { status: 403 });
    }

    // Delete old image if it exists
    if (oldImagePath) {
      await deleteUploadedImage(oldImagePath);
    }

    // Return updated list
    const updatedList = await getCustomListAccessForUser(listIdNum, userId);

    return apiSuccess({
      message: "Cover image uploaded successfully",
      list: updatedList,
    });
  } catch (err) {
    logger.error("[lists/cover POST] Error uploading cover image", err);
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiError("Unauthorized", { status: 401 });
    }
    return apiError("Failed to upload cover image", { status: 500 });
  }
}

/**
 * DELETE /api/v1/lists/[listId]/cover
 * Remove the custom cover image from a list
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const { listId } = await params;
    const listIdNum = parseInt(listId, 10);

    if (isNaN(listIdNum)) {
      return apiError("Invalid list ID", { status: 400 });
    }

    const list = await getCustomListAccessForUser(listIdNum, userId);
    if (!list) {
      return apiError("List not found", { status: 404 });
    }
    if (!list.canEdit) {
      return apiError("Forbidden", { status: 403 });
    }

    // Remove the image from database and get the path
    const { ok, imagePath } = await removeCustomListCoverImage(listIdNum, userId);
    if (!ok) {
      return apiError("Forbidden", { status: 403 });
    }

    // Delete the file
    if (imagePath) {
      await deleteUploadedImage(imagePath);
    }

    // Return updated list
    const updatedList = await getCustomListAccessForUser(listIdNum, userId);

    return apiSuccess({
      message: "Cover image removed successfully",
      list: updatedList,
    });
  } catch (err) {
    logger.error("[lists/cover DELETE] Error removing cover image", err);
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiError("Unauthorized", { status: 401 });
    }
    return apiError("Failed to remove cover image", { status: 500 });
  }
}
