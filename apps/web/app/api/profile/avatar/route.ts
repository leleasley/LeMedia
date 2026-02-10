import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserWithHash, updateUserAvatar } from "@/db";
import { getJellyfinApiKey, getJellyfinBaseUrl } from "@/lib/jellyfin-admin";
import { requireCsrf } from "@/lib/csrf";
import { logger } from "@/lib/logger";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;
  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const dbUser = await getUserWithHash(user.username);
  if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (!dbUser.jellyfin_user_id) {
    return NextResponse.json({ error: "Link a Jellyfin account before updating avatar" }, { status: 400 });
  }

  const [baseUrl, apiKey] = await Promise.all([
    getJellyfinBaseUrl(),
    getJellyfinApiKey()
  ]);
  if (!baseUrl || !apiKey) {
    return NextResponse.json({ error: "Jellyfin not configured" }, { status: 400 });
  }

  let file: File | null = null;
  try {
    const form = await req.formData();
    const entry = form.get("avatar");
    if (entry instanceof File) file = entry;
  } catch (err) {
    logger.warn("[API] Invalid avatar upload payload", { err });
  }

  if (!file) {
    return NextResponse.json({ error: "No avatar file provided" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Avatar must be 2MB or less" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Avatar must be JPEG, PNG, or WEBP" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = `${baseUrl.replace(/\/+$/, "")}/Users/${dbUser.jellyfin_user_id}/Images/Primary`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-Emby-Token": apiKey,
        "Content-Type": file.type
      },
      body: buffer
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json(
        { error: body || "Failed to update Jellyfin avatar" },
        { status: 502 }
      );
    }

    const avatarUrl = `/avatarproxy/${dbUser.jellyfin_user_id}`;
    await updateUserAvatar({ userId: dbUser.id, avatarUrl });
    const refreshed = await getUserWithHash(user.username);
    return NextResponse.json({
      avatarUrl,
      avatarVersion: refreshed?.avatar_version ?? null
    });
  } catch (err) {
    logger.error("[API] Jellyfin avatar update failed", err);
    return NextResponse.json({ error: "Failed to update avatar" }, { status: 500 });
  }
}
