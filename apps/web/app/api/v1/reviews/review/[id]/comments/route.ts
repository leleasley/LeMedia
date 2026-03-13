import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import {
  addReviewComment,
  addReviewCommentMentions,
  createNotification,
  getReviewById,
  getReviewCommentById,
  getReviewCommentCount,
  getReviewComments,
  listUsersByUsernames,
  upsertUser,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

const ParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const CreateCommentSchema = z.object({
  content: z.string().trim().min(1).max(2000),
  parentId: z.number().int().positive().optional(),
});

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") {
    return await (params as Promise<{ id: string }>);
  }
  return params as { id: string };
}

function extractMentionUsernames(content: string): string[] {
  const matches = new Set<string>();
  const regex = /(?:^|\s)@([a-zA-Z0-9._-]{2,32})\b/g;
  let match: RegExpExecArray | null = regex.exec(content);
  while (match) {
    matches.add(match[1].toLowerCase());
    if (matches.size >= 25) break;
    match = regex.exec(content);
  }
  return Array.from(matches);
}

export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = ParamsSchema.parse(await resolveParams(params));
  const review = await getReviewById(id);
  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const parentIdRaw = url.searchParams.get("parentId");
  const parsedParentId = parentIdRaw ? Number(parentIdRaw) : Number.NaN;
  if (parentIdRaw && (!Number.isFinite(parsedParentId) || parsedParentId <= 0)) {
    return NextResponse.json({ error: "Invalid parentId" }, { status: 400 });
  }
  const parentId = parentIdRaw ? parsedParentId : null;

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? "100"), 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? "0"), 0);

  const [comments, totalCount] = await Promise.all([
    getReviewComments(id, parentIdRaw ? parentId : null, limit, offset),
    parentIdRaw ? Promise.resolve(0) : getReviewCommentCount(id),
  ]);

  return NextResponse.json({
    comments,
    totalCount: parentIdRaw ? comments.length : totalCount,
  });
}

export async function POST(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = ParamsSchema.parse(await resolveParams(params));
  const body = CreateCommentSchema.parse(await req.json());

  const [review, dbUser] = await Promise.all([
    getReviewById(id),
    upsertUser(user.username, user.groups),
  ]);

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  if (body.parentId) {
    const parent = await getReviewCommentById(body.parentId);
    if (!parent || parent.reviewId !== id) {
      return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
    }
  }

  const comment = await addReviewComment(id, dbUser.id, body.content, body.parentId);

  const mentionUsernames = extractMentionUsernames(body.content);
  const mentionUsers = await listUsersByUsernames(mentionUsernames);
  const mentionTargets = mentionUsers.filter((mentioned) => mentioned.id !== dbUser.id);

  const link = `/${review.mediaType}/${review.tmdbId}#review-${review.id}`;
  const actorName = user.username;

  if (mentionTargets.length) {
    await addReviewCommentMentions(
      comment.id,
      mentionTargets.map((target) => target.id)
    ).catch((error) => {
      logger.warn("[reviews/comments] failed to persist mention rows", {
        reviewId: review.id,
        reviewCommentId: comment.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    await Promise.all(
      mentionTargets.map((target) =>
        createNotification({
          userId: target.id,
          type: "review_mention",
          title: "You were mentioned in a review thread",
          message: `${actorName} mentioned you in comments for \"${review.title}\".`,
          link,
          metadata: {
            reviewId: review.id,
            reviewCommentId: comment.id,
            mediaType: review.mediaType,
            tmdbId: review.tmdbId,
            mentionedBy: user.username,
          },
        }).catch((error) => {
          logger.warn("[reviews/comments] failed to notify mention", {
            userId: target.id,
            error: error instanceof Error ? error.message : String(error),
          });
        })
      )
    );
  }

  if (review.userId !== dbUser.id && !mentionTargets.some((target) => target.id === review.userId)) {
    await createNotification({
      userId: review.userId,
      type: "review_comment",
      title: "New comment on your review",
      message: `${actorName} commented on your review of \"${review.title}\".`,
      link,
      metadata: {
        reviewId: review.id,
        reviewCommentId: comment.id,
        mediaType: review.mediaType,
        tmdbId: review.tmdbId,
        commentedBy: user.username,
      },
    }).catch((error) => {
      logger.warn("[reviews/comments] failed to notify review owner", {
        userId: review.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return NextResponse.json({ comment }, { status: 201 });
}
