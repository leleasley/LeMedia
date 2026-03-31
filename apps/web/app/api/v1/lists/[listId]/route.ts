import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { logger } from "@/lib/logger";
import {
  deleteCustomList,
  listCustomListItems,
  getCustomListAccessForUser,
  listCustomListCollaborators,
  updateCustomList,
} from "@/db/lists";
import { getUserByUsername, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { deleteUploadedImage } from "@/lib/file-upload";
import { apiError, apiSuccess } from "@/lib/api-contract";

const UpdateListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  shareSlug: z.string().min(1).max(120).nullable().optional(),
  mood: z.string().max(80).optional(),
  occasion: z.string().max(80).optional(),
});

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId } = await resolveUserId();
    const { listId } = await params;
    const listIdNum = parseInt(listId, 10);

    if (isNaN(listIdNum)) {
      return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
    }

    const list = await getCustomListAccessForUser(listIdNum, userId);
    if (!list) {
      return apiError("List not found", { status: 404 });
    }

    const items = await listCustomListItems(listIdNum);
    const collaborators = await listCustomListCollaborators(listIdNum);
    const imageProxyEnabled = await getImageProxyEnabled();

    // Enrich items with TMDB data
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        try {
          const details =
            item.mediaType === "movie"
              ? await getMovie(item.tmdbId)
              : await getTv(item.tmdbId);
          const title =
            item.mediaType === "movie"
              ? (details as any).title
              : (details as any).name;
          const year =
            item.mediaType === "movie"
              ? ((details as any).release_date ?? "").slice(0, 4)
              : ((details as any).first_air_date ?? "").slice(0, 4);
          return {
            ...item,
            title,
            posterUrl: tmdbImageUrl((details as any).poster_path, "w500", imageProxyEnabled),
            year,
            rating: (details as any).vote_average ?? 0,
            description: (details as any).overview ?? "",
          };
        } catch {
          return { ...item, title: "Unknown", posterUrl: null, year: "", rating: 0, description: "" };
        }
      })
    );

    return jsonResponseWithETag(req, {
      list,
      items: enrichedItems,
      collaborators,
      access: {
        accessRole: list.accessRole,
        canEdit: list.canEdit,
        isOwner: list.isOwner,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiError("Unauthorized", { status: 401 });
    }
    return apiError("Unable to load list", { status: 500 });
  }
}

export async function PATCH(
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

    const body = await req.json();
    const parsed = UpdateListSchema.parse(body);

    const access = await getCustomListAccessForUser(listIdNum, userId);
    if (!access) {
      return apiError("List not found", { status: 404 });
    }
    if (!access.canEdit) {
      return apiError("Forbidden", { status: 403 });
    }
    if (!access.isOwner && (parsed.isPublic !== undefined || parsed.shareSlug !== undefined)) {
      return apiError("Only the owner can change sharing settings", { status: 403 });
    }

    const list = await updateCustomList(listIdNum, userId, parsed);
    if (!list) {
      return apiError("List not found", { status: 404 });
    }

    return apiSuccess({ list });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiError("Unauthorized", { status: 401 });
    }
    if (err instanceof Error && err.message === "Owner privileges required") {
      return apiError("Only the owner can change sharing settings", { status: 403 });
    }
    if (err instanceof Error && err.message === "Invalid share slug") {
      return apiError("Invalid share slug", { status: 400 });
    }
    if (err instanceof Error && err.message === "Share slug already in use") {
      return apiError("Share slug already in use", { status: 409 });
    }
    if (err instanceof z.ZodError) {
      logger.warn("[lists/[listId] PATCH] Invalid request payload", { issues: err.issues });
      return apiError("Invalid request", { status: 400 });
    }
    return apiError("Unable to update list", { status: 500 });
  }
}

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

    const result = await deleteCustomList(listIdNum, userId);
    if (!result.deleted) {
      return apiError("List not found", { status: 404 });
    }

    // Clean up uploaded image if it exists
    if (result.imagePath) {
      await deleteUploadedImage(result.imagePath);
    }

    return apiSuccess({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return apiError("Unauthorized", { status: 401 });
    }
    return apiError("Unable to delete list", { status: 500 });
  }
}
