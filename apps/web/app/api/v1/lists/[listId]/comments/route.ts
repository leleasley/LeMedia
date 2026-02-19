import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { logger } from "@/lib/logger";
import { requireCsrf } from "@/lib/csrf";
import { getUserByUsername, upsertUser } from "@/db";
import {
  getListComments, addListComment, getListWithSocialMeta,
  canViewList, checkRateLimit, recordRateLimitAction,
  createSocialNotification, createSocialEvent
} from "@/db-social";

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

const CommentSchema = z.object({
  content: z.string().min(1).max(2000),
  parentId: z.number().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    const id = parseInt(listId);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid list ID" }, { status: 400 });

    // Check list exists and is accessible
    const list = await getListWithSocialMeta(id);
    if (!list) return NextResponse.json({ error: "List not found" }, { status: 404 });

    let viewerUserId: number | null = null;
    try { viewerUserId = (await resolveUserId()).id; } catch { /* public */ }

    const canView = await canViewList(list.userId, viewerUserId, list.visibility);
    if (!canView) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const url = new URL(req.url);
    const parentId = url.searchParams.get("parentId") ? parseInt(url.searchParams.get("parentId")!) : null;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const offset = parseInt(url.searchParams.get("offset") || "0");

    const comments = await getListComments(id, parentId, limit, offset);
    return NextResponse.json({ comments });
  } catch (err) {
    return NextResponse.json({ error: "Unable to load comments" }, { status: 500 });
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
    if (!list.allowComments) return NextResponse.json({ error: "Comments are disabled for this list" }, { status: 403 });

    const canView = await canViewList(list.userId, userId, list.visibility);
    if (!canView) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    // Rate limit: 30 comments per hour
    const allowed = await checkRateLimit(userId, "comment", 30, 60);
    if (!allowed) {
      return NextResponse.json({ error: "Too many comments. Please try again later." }, { status: 429 });
    }

    const body = await req.json();
    const parsed = CommentSchema.parse(body);

    const comment = await addListComment(id, userId, parsed.content, parsed.parentId);
    await recordRateLimitAction(userId, "comment");

    // Notify list owner (if not self)
    if (list.userId !== userId) {
      await createSocialNotification(
        list.userId,
        "list_comment",
        "New Comment",
        `${username} commented on your list "${list.name}"`,
        `/lists/${id}`,
        { listId: id, commentId: comment.id, username }
      );
    }

    // Create social event
    await createSocialEvent(userId, "commented_list", "list", id, {
      listName: list.name,
      listOwner: list.ownerUsername,
    }).catch(() => {});

    return NextResponse.json({ comment }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof z.ZodError) {
      logger.warn("[lists/comments] Invalid request payload", { issues: err.issues });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to add comment" }, { status: 500 });
  }
}
