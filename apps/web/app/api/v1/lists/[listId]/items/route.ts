import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { logger } from "@/lib/logger";
import {
  addCustomListItem,
  getCustomListById,
  getUserByUsername,
  removeCustomListItem,
  reorderCustomListItems,
  setCustomListCover,
  upsertUser,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";

const AddItemSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
  note: z.string().max(500).optional(),
  setAsCover: z.boolean().optional(),
});

const RemoveItemSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(["movie", "tv"]),
});

const ReorderSchema = z.object({
  itemIds: z.array(z.number().int().positive()),
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
      return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });
    }

    // Verify ownership
    const list = await getCustomListById(listIdNum);
    if (!list || Number(list.userId) !== userId) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = AddItemSchema.parse(body);

    const item = await addCustomListItem({
      listId: listIdNum,
      tmdbId: parsed.tmdbId,
      mediaType: parsed.mediaType,
      note: parsed.note,
    });

    // Set as cover if requested or if it's the first item
    if (parsed.setAsCover || Number(list.itemCount) === 0) {
      await setCustomListCover(listIdNum, userId, parsed.tmdbId, parsed.mediaType);
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      logger.warn("[lists/items POST] Invalid request payload", { issues: err.issues });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to add item" }, { status: 500 });
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

    // Verify ownership
    const list = await getCustomListById(listIdNum);
    if (!list || Number(list.userId) !== userId) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = RemoveItemSchema.parse(body);

    await removeCustomListItem(listIdNum, parsed.tmdbId, parsed.mediaType);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      logger.warn("[lists/items DELETE] Invalid request payload", { issues: err.issues });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to remove item" }, { status: 500 });
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

    // Verify ownership
    const list = await getCustomListById(listIdNum);
    if (!list || Number(list.userId) !== userId) {
      return NextResponse.json({ error: "List not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = ReorderSchema.parse(body);

    await reorderCustomListItems(listIdNum, parsed.itemIds);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      logger.warn("[lists/items PATCH] Invalid request payload", { issues: err.issues });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to reorder items" }, { status: 500 });
  }
}
