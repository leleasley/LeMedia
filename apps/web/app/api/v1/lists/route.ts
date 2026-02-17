import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import {
  createCustomList,
  getUserByUsername,
  listUserCustomLists,
  upsertUser,
} from "@/db";
import { requireCsrf } from "@/lib/csrf";
import { jsonResponseWithETag } from "@/lib/api-optimization";

const CreateListSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  mood: z.string().max(80).optional(),
  occasion: z.string().max(80).optional(),
});

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) {
    throw new Error("Unauthorized");
  }
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

export async function GET(req: NextRequest) {
  try {
    const { id: userId } = await resolveUserId();
    const lists = await listUserCustomLists(userId);
    return jsonResponseWithETag(req, { lists });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unable to load lists" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id: userId } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const parsed = CreateListSchema.parse(body);

    const list = await createCustomList({
      userId,
      name: parsed.name,
      description: parsed.description,
      isPublic: parsed.isPublic,
      mood: parsed.mood,
      occasion: parsed.occasion,
    });

    return NextResponse.json({ list }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to create list" }, { status: 500 });
  }
}
