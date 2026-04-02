import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { getUserWithHash, upsertUser } from "@/db";
import { createSocialEvent, deleteMediaReaction, getMediaReactionAggregate, upsertMediaReaction } from "@/db-social";
import { requireCsrf } from "@/lib/csrf";

export const dynamic = "force-dynamic";

const ParamsSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.coerce.number().int().positive(),
});

const UpdateSchema = z.object({
  emoji: z.string().trim().min(1).max(16),
  worthWatching: z.boolean(),
  note: z.string().max(180).optional().nullable(),
  mediaTitle: z.string().max(200).optional().nullable(),
});

async function resolveUserId() {
  const user = await requireUser();
  if (user instanceof Response) return { response: user, userId: null as number | null, username: null as string | null };

  const dbUser = await getUserWithHash(user.username).catch(() => null);
  if (dbUser?.id) return { response: null as NextResponse | null, userId: dbUser.id as number, username: user.username };

  const upserted = await upsertUser(user.username, user.groups).catch(() => null);
  if (!upserted?.id) {
    return {
      response: NextResponse.json({ error: "User not found" }, { status: 404 }),
      userId: null,
      username: null,
    };
  }

  return { response: null as NextResponse | null, userId: upserted.id, username: user.username };
}

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ mediaType: string; tmdbId: string }> }
) {
  const auth = await resolveUserId();
  if (auth.response) return auth.response;

  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const data = await getMediaReactionAggregate(auth.userId!, params.data.mediaType, params.data.tmdbId);
  return NextResponse.json(data);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ mediaType: string; tmdbId: string }> }
) {
  const auth = await resolveUserId();
  if (auth.response) return auth.response;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const bodyParsed = UpdateSchema.safeParse(await req.json().catch(() => ({})));
  if (!bodyParsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const reaction = await upsertMediaReaction({
    userId: auth.userId!,
    mediaType: params.data.mediaType,
    tmdbId: params.data.tmdbId,
    emoji: bodyParsed.data.emoji,
    worthWatching: bodyParsed.data.worthWatching,
    note: bodyParsed.data.note ?? null,
  });

  await createSocialEvent(
    auth.userId!,
    "reacted_media",
    params.data.mediaType,
    params.data.tmdbId,
    {
      mediaType: params.data.mediaType,
      tmdbId: params.data.tmdbId,
      emoji: reaction.emoji,
      worthWatching: reaction.worthWatching,
      mediaTitle: bodyParsed.data.mediaTitle ?? null,
      notePreview: reaction.note ? String(reaction.note).slice(0, 80) : null,
    },
    "friends"
  );

  const aggregate = await getMediaReactionAggregate(auth.userId!, params.data.mediaType, params.data.tmdbId);
  return NextResponse.json({ ...aggregate, me: reaction });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ mediaType: string; tmdbId: string }> }
) {
  const auth = await resolveUserId();
  if (auth.response) return auth.response;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const params = ParamsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  await deleteMediaReaction(auth.userId!, params.data.mediaType, params.data.tmdbId);
  const aggregate = await getMediaReactionAggregate(auth.userId!, params.data.mediaType, params.data.tmdbId);
  return NextResponse.json(aggregate);
}
