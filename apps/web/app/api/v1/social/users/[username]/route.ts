import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getUserByUsername, upsertUser } from "@/db";
import { getUserProfile, getUserSocialStats, getFriendStatus, getPublicListsForUser, getMutualTasteInsights } from "@/db-social";

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const { username } = await params;
    const profile = await getUserProfile(username);

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let viewerUserId: number | null = null;
    let friendStatus: string = "none";
    let mutualInsights: object | null = null;

    try {
      const viewer = await resolveUserId();
      viewerUserId = viewer.id;
      friendStatus = await getFriendStatus(viewer.id, profile.id);
    } catch {
      // Not authenticated - public view
    }

    // Check privacy
    const isSelf = viewerUserId === profile.id;
    const isFriend = friendStatus === "friends";

    if (profile.profileVisibility === "private" && !isSelf) {
      return NextResponse.json({
        profile: {
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          avatarVersion: profile.avatarVersion,
          profileVisibility: profile.profileVisibility,
        },
        friendStatus,
        isPrivate: true,
      });
    }

    if (profile.profileVisibility === "friends" && !isSelf && !isFriend) {
      return NextResponse.json({
        profile: {
          id: profile.id,
          username: profile.username,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          avatarVersion: profile.avatarVersion,
          profileVisibility: profile.profileVisibility,
        },
        friendStatus,
        isFriendsOnly: true,
      });
    }

    // Full profile view
    const [stats, lists] = await Promise.all([
      profile.showStats ? getUserSocialStats(profile.id) : null,
      profile.showLists ? getPublicListsForUser(profile.id, viewerUserId, { sort: "pinned", limit: 20 }) : [],
    ]);

    // Mutual taste only for friends
    if (viewerUserId && isFriend) {
      try {
        mutualInsights = await getMutualTasteInsights(viewerUserId, profile.id);
      } catch { /* ignore */ }
    }

    return NextResponse.json({
      profile: {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        avatarVersion: profile.avatarVersion,
        bannerUrl: profile.bannerUrl,
        profileVisibility: profile.profileVisibility,
        showActivity: profile.showActivity,
        showStats: profile.showStats,
        showLists: profile.showLists,
        createdAt: profile.createdAt,
      },
      stats,
      lists,
      friendStatus,
      mutualInsights,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to load profile" }, { status: 500 });
  }
}
