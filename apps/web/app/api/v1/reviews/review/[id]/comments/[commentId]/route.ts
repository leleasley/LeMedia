import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  deleteReviewComment,
  getReviewCommentById,
  updateReviewComment,
  upsertUser,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  commentId: z.coerce.number().int().positive(),
});

const PatchBodySchema = z.object({
  content: z.string().trim().min(1).max(2000),
});

type ParamsInput = { id: string; commentId: string } | Promise<{ id: string; commentId: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") {
    return await (params as Promise<{ id: string; commentId: string }>);
  }
  return params as { id: string; commentId: string };
}

export async function PATCH(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id, commentId } = ParamsSchema.parse(await resolveParams(params));
  const body = PatchBodySchema.parse(await req.json());

  const [dbUser, existingComment] = await Promise.all([
    upsertUser(user.username, user.groups),
    getReviewCommentById(commentId),
  ]);

  if (!existingComment || existingComment.reviewId !== id) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  if (existingComment.userId !== dbUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const updated = await updateReviewComment(id, commentId, dbUser.id, body.content);
  if (!updated) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  return NextResponse.json({ comment: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id, commentId } = ParamsSchema.parse(await resolveParams(params));
  const dbUser = await upsertUser(user.username, user.groups);

  const existingComment = await getReviewCommentById(commentId);
  if (!existingComment || existingComment.reviewId !== id) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const deleted = await deleteReviewComment(id, commentId, dbUser.id, user.isAdmin);
  if (!deleted) {
    return NextResponse.json({ error: "Comment not found or forbidden" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
