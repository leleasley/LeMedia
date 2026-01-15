import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { createJellyfinUser, getUserByEmailOrUsername, getUserByJellyfinUserId, linkUserToJellyfin } from "@/db";
import { getJellyfinApiKey, getJellyfinBaseUrl, listJellyfinUsers } from "@/lib/jellyfin-admin";
import { z } from "zod";
import { requireCsrf } from "@/lib/csrf";

const payloadSchema = z.object({
  jellyfinUserIds: z.array(z.string().min(1))
});

function normalizeUsername(username: string) {
  const base = username.trim().toLowerCase().replace(/\s+/g, "_");
  return base || "jellyfin_user";
}

function buildDeviceId(username: string) {
  return Buffer.from(`BOT_lemedia_${username}`).toString("base64");
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  let body: z.infer<typeof payloadSchema>;
  try {
    body = payloadSchema.parse(await req.json());
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues.map(issue => issue.message).join(", ") : "Invalid payload";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const baseUrl = await getJellyfinBaseUrl();
  const apiKey = await getJellyfinApiKey();
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "Jellyfin not configured" }, { status: 400 });
  }

  const jellyfinUsers = await listJellyfinUsers(baseUrl, apiKey);
  const jellyfinMap = new Map(jellyfinUsers.map(user => [user.id, user]));
  const createdUsers = [];
  const linkedUsers = [];

  for (const jellyfinUserId of body.jellyfinUserIds) {
    const jellyfinUser = jellyfinMap.get(jellyfinUserId);
    if (!jellyfinUser) continue;

    const existingLink = await getUserByJellyfinUserId(jellyfinUserId);
    if (existingLink) continue;

    const normalizedUsername = normalizeUsername(jellyfinUser.username);
    const existingByEmailOrUsername = await getUserByEmailOrUsername(null, normalizedUsername);

    if (existingByEmailOrUsername) {
      await linkUserToJellyfin({
        userId: existingByEmailOrUsername.id,
        jellyfinUserId,
        jellyfinUsername: jellyfinUser.username,
        jellyfinDeviceId: buildDeviceId(existingByEmailOrUsername.username),
        jellyfinAuthToken: null,
        avatarUrl: `/avatarproxy/${jellyfinUserId}`
      });
      linkedUsers.push(existingByEmailOrUsername.id);
      continue;
    }

    const created = await createJellyfinUser({
      username: normalizedUsername,
      email: null,
      groups: ["users"],
      jellyfinUserId,
      jellyfinUsername: jellyfinUser.username,
      jellyfinDeviceId: buildDeviceId(normalizedUsername),
      avatarUrl: `/avatarproxy/${jellyfinUserId}`
    });
    createdUsers.push(created.id);
  }

  return NextResponse.json({ createdUserIds: createdUsers, linkedUserIds: linkedUsers });
}
