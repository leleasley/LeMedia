import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { getJellyfinApiKey, getJellyfinBaseUrl, listJellyfinUsers } from "@/lib/jellyfin-admin";
import { jsonResponseWithETag } from "@/lib/api-optimization";

export async function GET(req: NextRequest) {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const baseUrl = await getJellyfinBaseUrl();
  const apiKey = await getJellyfinApiKey();
  if (!baseUrl || !apiKey) {
    return jsonResponseWithETag(req, { error: "Jellyfin not configured" }, { status: 400 });
  }

  try {
    const users = await listJellyfinUsers(baseUrl, apiKey);
    return jsonResponseWithETag(req, {
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        avatarUrl: `/avatarproxy/${user.id}`
      }))
    });
  } catch (err: any) {
    return jsonResponseWithETag(req, { error: err?.message ?? "Failed to load users" }, { status: 500 });
  }
}
