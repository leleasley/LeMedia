import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/auth";
import { deleteUserReview, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const Params = z.object({ id: z.coerce.number().int().positive() });

type ParamsInput = { id: string } | Promise<{ id: string }>;

async function resolveParams(params: ParamsInput) {
  if (params && typeof (params as any).then === "function") return await (params as Promise<{ id: string }>);
  return params as { id: string };
}

export async function DELETE(req: NextRequest, { params }: { params: ParamsInput }) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const { id } = Params.parse(await resolveParams(params));
  const dbUser = await upsertUser(user.username, user.groups);

  const removed = await deleteUserReview(id, dbUser.id);
  if (!removed) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
