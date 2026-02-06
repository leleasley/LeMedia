import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { deleteUserTraktToken, getUserWithHash, updateUserProfile } from "@/db";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await deleteUserTraktToken(dbUser.id);
    await updateUserProfile(dbUser.id, { traktUsername: null });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to disconnect Trakt" }, { status: 500 });
  }
}
