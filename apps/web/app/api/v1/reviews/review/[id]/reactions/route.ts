import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { addReviewReaction, getReviewById, getReviewReactions, removeReviewReaction, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";


const Params = z.object({
  id: z.coerce.number().int().positive(),
});

const Body = z.object({
  reaction: z.enum(["helpful"]).optional().default("helpful"),
});

type ParamsInput = { id: string } | Promise<{ id: string }>;


async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}


async function resolveViewer() {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const dbUser = await upsertUser(user.username, user.groups);
  return { dbUser };
}


export async function GET(req: NextRequest, { params }: { params: ParamsInput }) {
  const resolved = await resolveViewer();
  if (resolved instanceof NextResponse) return resolved;

  const { id } = Params.parse(await resolveParams(params));
  const review = await getReviewById(id);
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  const reactions = await getReviewReactions(id, resolved.dbUser.id);
  return NextResponse.json({ reactions });
}


export async function POST(req: NextRequest, { params }: { params: ParamsInput }) {
  const resolved = await resolveViewer();
  if (resolved instanceof NextResponse) return resolved;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = Params.parse(await resolveParams(params));
  const review = await getReviewById(id);
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  const body = Body.parse(await req.json().catch(() => ({})));
  await addReviewReaction(id, resolved.dbUser.id, body.reaction);
  const reactions = await getReviewReactions(id, resolved.dbUser.id);

  return NextResponse.json({ reactions }, { status: 201 });
}


export async function DELETE(req: NextRequest, { params }: { params: ParamsInput }) {
  const resolved = await resolveViewer();
  if (resolved instanceof NextResponse) return resolved;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = Params.parse(await resolveParams(params));
  const review = await getReviewById(id);
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });

  const reaction = Body.parse({ reaction: new URL(req.url).searchParams.get("reaction") ?? "helpful" }).reaction;
  await removeReviewReaction(id, resolved.dbUser.id, reaction);
  const reactions = await getReviewReactions(id, resolved.dbUser.id);

  return NextResponse.json({ reactions });
}