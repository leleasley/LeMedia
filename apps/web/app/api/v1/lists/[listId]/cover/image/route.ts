import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getCustomListById, getUserByUsername, upsertUser } from "@/db";
import { defaultListCoverDeps, handleListCoverImageRequest } from "@/lib/lists-cover-image";
import { logger } from "@/lib/logger";

async function resolveOptionalUserId(): Promise<number | null> {
  const user = await getUser().catch(() => null);
  if (!user) return null;
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return dbUser.id;
  const created = await upsertUser(user.username, user.groups);
  return created.id;
}

export const coverImageRouteDeps = {
  getCustomListById,
  resolveOptionalUserId,
  readFile: defaultListCoverDeps.readFile,
};

/**
 * GET /api/v1/lists/[listId]/cover/image
 * Serve the custom cover image
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ listId: string }> }
) {
  try {
    const { listId } = await params;
    return handleListCoverImageRequest(listId, coverImageRouteDeps);
  } catch (err) {
    logger.error("[lists/cover/image] Error serving image", err);
    return NextResponse.json({ error: "Failed to serve image" }, { status: 500 });
  }
}
