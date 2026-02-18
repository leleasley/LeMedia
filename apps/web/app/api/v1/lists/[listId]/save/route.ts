import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getUserByUsername, upsertUser, createCustomList, listCustomListItems, addCustomListItem } from "@/db";
import {
  saveList, unsaveList, hasUserSavedList, remixList,
  getListWithSocialMeta, canViewList, createSocialNotification, createSocialEvent,
} from "@/db-social";

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

// POST /api/v1/lists/:id/save - Save or remix a list
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId, username } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const { listId } = await params;
    const id = parseInt(listId);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });

    const list = await getListWithSocialMeta(id);
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

    const canView = await canViewList(list.userId, userId, list.visibility);
    if (!canView) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const isRemix = body.remix === true;

    if (isRemix) {
      if (!list.allowRemix) return NextResponse.json({ error: "Remixing is disabled for this list" }, { status: 403 });

      // Create a copy of the list
      const newList = await createCustomList({
        userId,
        name: `${list.name} (remix)`,
        description: list.description ? `Remixed from ${list.ownerUsername}'s list: ${list.description}` : `Remixed from ${list.ownerUsername}'s list`,
        isPublic: false,
        mood: list.mood ?? undefined,
        occasion: list.occasion ?? undefined,
      });

      // Copy items
      const items = await listCustomListItems(id);
      for (const item of items) {
        await addCustomListItem({
          listId: newList.id,
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          note: item.note ?? undefined,
        }).catch(() => {}); // Ignore duplicates
      }

      await remixList(id, userId, newList.id);

      // Social event
      await createSocialEvent(userId, "saved_list", "list", id, {
        listName: list.name,
        listOwner: list.ownerUsername,
        isRemix: true,
        newListId: newList.id,
      }).catch(() => {});

      // Notify owner
      if (list.userId !== userId) {
        await createSocialNotification(
          list.userId,
          "list_remix",
          "List Remixed",
          `${username} remixed your list "${list.name}"`,
          `/lists/${newList.id}`,
          { listId: id, newListId: newList.id, username }
        ).catch(() => {});
      }

      return NextResponse.json({ saved: true, remix: true, newListId: newList.id }, { status: 201 });
    }

    // Simple save
    await saveList(id, userId);

    // Social event
    await createSocialEvent(userId, "saved_list", "list", id, {
      listName: list.name,
      listOwner: list.ownerUsername,
    }).catch(() => {});

    // Notify owner
    if (list.userId !== userId) {
      await createSocialNotification(
        list.userId,
        "list_save",
        "List Saved",
        `${username} saved your list "${list.name}"`,
        `/lists/${id}`,
        { listId: id, username }
      ).catch(() => {});
    }

    return NextResponse.json({ saved: true }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to save list" }, { status: 500 });
  }
}

// DELETE /api/v1/lists/:id/save - Unsave a list
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const { listId } = await params;
    const id = parseInt(listId);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });

    await unsaveList(id, userId);
    return NextResponse.json({ saved: false });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to unsave list" }, { status: 500 });
  }
}

// GET /api/v1/lists/:id/save - Check if saved
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { id: userId } = await resolveUserId();
    const { listId } = await params;
    const id = parseInt(listId);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });

    const saved = await hasUserSavedList(id, userId);
    return NextResponse.json({ saved });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to check save status" }, { status: 500 });
  }
}
