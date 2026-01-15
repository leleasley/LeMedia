import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { createMediaIssue, countMediaIssuesByTmdb, getUserWithHash } from "@/db";
import { notifyIssueEvent } from "@/notifications/issue-events";
import { requireCsrf } from "@/lib/csrf";

const BodySchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.coerce.number().int().positive(),
  title: z.string().min(1),
  category: z.enum(["video", "audio", "subtitle", "other"]),
  description: z.string().min(5).max(2000)
});

const LIMITS: Record<"movie" | "tv", number> = {
  movie: 5,
  tv: 10
};

export async function POST(req: NextRequest) {
  try {
    const user = await getUser();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;
    const body = BodySchema.parse(await req.json());
    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const existingCount = await countMediaIssuesByTmdb(body.mediaType, body.tmdbId);
    if (existingCount >= LIMITS[body.mediaType]) {
      return NextResponse.json({ error: "Issue limit reached for this title" }, { status: 429 });
    }

    const issue = await createMediaIssue({
      mediaType: body.mediaType,
      tmdbId: body.tmdbId,
      title: body.title,
      category: body.category,
      description: body.description,
      reporterId: dbUser.id
    });

    const base = process.env.APP_BASE_URL?.trim();
    const url = base ? `${base.replace(/\/+$/, "")}/${body.mediaType}/${body.tmdbId}` : null;

    await notifyIssueEvent("issue_reported", {
      issueId: issue.id,
      mediaType: body.mediaType,
      tmdbId: body.tmdbId,
      title: body.title,
      category: body.category,
      description: body.description,
      username: user.username,
      userId: dbUser.id,
      imageUrl: null,
      url
    });

    return NextResponse.json({ issue });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to submit issue" }, { status: 500 });
  }
}
