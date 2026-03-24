import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getRequestById, getRequestUpvote, toggleRequestUpvote, upsertUser } from "@/db";
import { requireCsrf } from "@/lib/csrf";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const { id } = await params;
  const request = await getRequestById(id);
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dbUser = await upsertUser(user.username, user.groups);
  const result = await getRequestUpvote(id, dbUser.id);
  return NextResponse.json(result);
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
  const request = await getRequestById(id);
  if (!request) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const dbUser = await upsertUser(user.username, user.groups);
  const result = await toggleRequestUpvote(id, dbUser.id);
  return NextResponse.json(result);
}
