import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getUserByUsername, upsertUser } from "@/db";
import { updateUserProfile } from "@/db-social";

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

const UpdateProfileSchema = z.object({
  bio: z.string().max(500).nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  displayName: z.string().max(50).nullable().optional(),
  profileVisibility: z.enum(["public", "friends", "private"]).optional(),
  showActivity: z.boolean().optional(),
  allowFriendRequests: z.boolean().optional(),
  showStats: z.boolean().optional(),
  showLists: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { id: userId } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const parsed = UpdateProfileSchema.parse(body);
    const updated = await updateUserProfile(userId, parsed);

    return NextResponse.json({ profile: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid request", details: err.issues }, { status: 400 });
    return NextResponse.json({ error: "Unable to update profile" }, { status: 500 });
  }
}
