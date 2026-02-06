import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { requireCsrf } from "@/lib/csrf";
import { importLetterboxdReviews } from "@/lib/letterboxd";
import { getUserWithHash } from "@/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    if (user instanceof NextResponse) return user;
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const dbUser = await getUserWithHash(user.username);
    if (!dbUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!dbUser.letterboxd_username) {
      return NextResponse.json({ error: "No Letterboxd username linked" }, { status: 400 });
    }

    const result = await importLetterboxdReviews({ userId: dbUser.id, limitPerUser: 25 });
    return NextResponse.json({ success: true, stats: result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Failed to import Letterboxd reviews" }, { status: 500 });
  }
}
