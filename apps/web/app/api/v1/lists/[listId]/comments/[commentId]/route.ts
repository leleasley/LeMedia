import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getUserByUsername, upsertUser } from "@/db";
import { updateListComment, deleteListComment } from "@/db-social";

async function resolveUser() {
  const user = await getUser().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username, isAdmin: user.isAdmin };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username, isAdmin: user.isAdmin };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string; commentId: string }> }
) {
  try {
    const user = await resolveUser();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const { commentId } = await params;
    const id = parseInt(commentId);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid comment ID" }, { status: 400 });

    const body = await req.json();
    const content = body.content;
    if (!content || typeof content !== "string" || content.length > 2000) {
      return NextResponse.json({ error: "Invalid content" }, { status: 400 });
    }

    const updated = await updateListComment(id, user.id, content);
    if (!updated) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

    return NextResponse.json({ comment: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to update comment" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ listId: string; commentId: string }> }
) {
  try {
    const user = await resolveUser();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const { commentId } = await params;
    const id = parseInt(commentId);
    if (isNaN(id)) return NextResponse.json({ error: "Invalid comment ID" }, { status: 400 });

    const deleted = await deleteListComment(id, user.id, user.isAdmin);
    if (!deleted) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to delete comment" }, { status: 500 });
  }
}
