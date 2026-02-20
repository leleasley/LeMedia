import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { deleteRequestComment, getRequestById, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const Params = z.object({
  id: z.string().uuid(),
  commentId: z.coerce.number().int().positive(),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id, commentId } = Params.parse(await params);

  const request = await getRequestById(id);
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const dbUser = await upsertUser(user.username, user.groups);
  const deleted = await deleteRequestComment(commentId, dbUser.id, user.isAdmin);

  if (!deleted) {
    return NextResponse.json(
      { error: "Comment not found or insufficient permissions" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
