import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { logger } from "@/lib/logger";
import { requireCsrf } from "@/lib/csrf";
import { getUserByUsername, upsertUser } from "@/db";
import {
  addListReaction, removeListReaction, getListReactions,
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

const ReactionSchema = z.object({
  reaction: z.enum(["like", "love", "fire", "mindblown", "clap"]).optional().default("like"),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const id = parseInt(listId);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });

    let viewerUserId: number | null = null;
    try { viewerUserId = (await resolveUserId()).id; } catch { /* public */ }

    const list = await getListWithSocialMeta(id);
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

    const canView = await canViewList(list.userId, viewerUserId, list.visibility);
    if (!canView) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const reactions = await getListReactions(id, viewerUserId ?? undefined);
    return NextResponse.json({ reactions });
  } catch (err) {
    return NextResponse.json({ error: "Unable to load reactions" }, { status: 500 });
  }
}

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
    if (!list.allowReactions) return NextResponse.json({ error: "Reactions are disabled" }, { status: 403 });

    const canView = await canViewList(list.userId, userId, list.visibility);
    if (!canView) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const body = await req.json();
    const parsed = ReactionSchema.parse(body);

    await addListReaction(id, userId, parsed.reaction);

    // Notify list owner (if not self & if it's a like)
    if (list.userId !== userId && parsed.reaction === "like") {
      await createSocialNotification(
        list.userId,
        "list_reaction",
        "New Reaction",
        `${username} liked your list "${list.name}"`,
        `/lists/${id}`,
        { listId: id, reaction: parsed.reaction, username }
      ).catch(() => {});
    }

    // Social event
    await createSocialEvent(userId, "liked_list", "list", id, {
      listName: list.name,
      listOwner: list.ownerUsername,
      reaction: parsed.reaction,
    }).catch(() => {});

    const reactions = await getListReactions(id, userId);
    return NextResponse.json({ reactions }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof z.ZodError) {
      logger.warn("[lists/reactions] Invalid request payload", { issues: err.issues });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to add reaction" }, { status: 500 });
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
    const id = parseInt(listId);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });

    const url = new URL(req.url);
    const reaction = url.searchParams.get("reaction") || "like";
    await removeListReaction(id, userId, reaction);

    const reactions = await getListReactions(id, userId);
    return NextResponse.json({ reactions });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to remove reaction" }, { status: 500 });
  }
}
