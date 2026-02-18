import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { getUserByUsername, upsertUser } from "@/db";
import { searchUsers, discoverUsers } from "@/db-social";

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

const SearchSchema = z.object({
  q: z.string().min(1).max(100).optional(),
  filter: z.enum(["trending", "similar", "new", "friends"]).optional(),
  limit: z.coerce.number().min(1).max(50).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { id: userId } = await resolveUserId();
    const url = new URL(req.url);
    const parsed = SearchSchema.parse({
      q: url.searchParams.get("q") || undefined,
      filter: url.searchParams.get("filter") || undefined,
      limit: url.searchParams.get("limit") || undefined,
      offset: url.searchParams.get("offset") || undefined,
    });

    if (parsed.q) {
      const users = await searchUsers(parsed.q, userId, {
        limit: parsed.limit,
        offset: parsed.offset,
        friendsOnly: parsed.filter === "friends",
      });
      return NextResponse.json({ users });
    }

    const users = await discoverUsers(userId, {
      limit: parsed.limit,
      offset: parsed.offset,
      filter: (parsed.filter as "trending" | "similar" | "new") || undefined,
    });
    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to search users" }, { status: 500 });
  }
}
