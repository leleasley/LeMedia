import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { addRequestComment, getRequestComments, getRequestById, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const AddCommentBody = z.object({
  comment: z.string().trim().min(1).max(2000),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const request = await getRequestById(id);
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Users can only view comments on their own requests, admins can view all
  if (!user.isAdmin && request.user_id !== (await upsertUser(user.username, user.groups)).id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const comments = await getRequestComments(id);
  return NextResponse.json({ comments });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = await params;
  const body = AddCommentBody.parse(await req.json());

  const request = await getRequestById(id);
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const dbUser = await upsertUser(user.username, user.groups);

  // Users can only comment on their own requests, admins can comment on any
  if (!user.isAdmin && request.user_id !== dbUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await addRequestComment({
    requestId: id,
    userId: dbUser.id,
    comment: body.comment,
    isAdminComment: user.isAdmin,
  });

  return NextResponse.json({
    ok: true,
    commentId: result.id,
    createdAt: result.createdAt,
  });
}
