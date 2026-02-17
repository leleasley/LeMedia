import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import {
  deleteCustomList,
  getCustomListById,
  getUserByUsername,
  listCustomListItems,
  updateCustomList,
  upsertUser,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { jsonResponseWithETag } from "@/lib/api-optimization";
import { deleteUploadedImage } from "@/lib/file-upload";

const UpdateListSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  shareSlug: z.string().min(1).max(120).optional(),
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

    const list = await getCustomListById(listIdNum);
    if (!list || Number(list.userId) !== userId) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    const items = await listCustomListItems(listIdNum);
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

    return jsonResponseWithETag(req, { list, items: enrichedItems });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load list" }, { status: 500 });
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
      return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
    }

    const body = await req.json();
    const parsed = UpdateListSchema.parse(body);

    const list = await updateCustomList(listIdNum, userId, parsed);
    if (!list) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    return NextResponse.json({ list });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof Error && err.message === "Invalid share slug") {
      return NextResponse.json({ error: "Invalid share slug" }, { status: 400 });
    }
    if (err instanceof Error && err.message === "Share slug already in use") {
      return NextResponse.json({ error: "Share slug already in use" }, { status: 409 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update list" }, { status: 500 });
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
      return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
    }

    const result = await deleteCustomList(listIdNum, userId);
    if (!result.deleted) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    // Clean up uploaded image if it exists
    if (result.imagePath) {
      await deleteUploadedImage(result.imagePath);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to delete list" }, { status: 500 });
  }
}
