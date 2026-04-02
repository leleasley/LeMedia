import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/auth";
import { getUserByUsername, listUserMediaList, upsertUser } from "@/db";
import { getUserProfile, getUserSocialStats, getFriendStatus, getPublicListsForUser, getMutualTasteInsights } from "@/db-social";
import { getMovie, getTv, tmdbImageUrl } from "@/lib/tmdb";
import { getImageProxyEnabled } from "@/lib/app-settings";

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
    const imageProxyEnabled = await getImageProxyEnabled();
    const [stats, lists, rawWatched] = await Promise.all([
      profile.showStats ? getUserSocialStats(profile.id) : null,
      profile.showLists ? getPublicListsForUser(profile.id, viewerUserId, { sort: "pinned", limit: 20 }) : [],
      profile.showWatched ? listUserMediaList({ userId: profile.id, listType: "watched", limit: 50 }) : [],
    ]);

    // Enrich watched items with TMDB data
    const watchedItems = (await Promise.all(
      rawWatched.map(async (item: any) => {
        const details = item.media_type === "movie"
          ? await getMovie(item.tmdb_id).catch(() => null)
          : await getTv(item.tmdb_id).catch(() => null);
        if (!details) return null;
        const title = item.media_type === "movie" ? details.title ?? "Untitled" : details.name ?? "Untitled";
        return {
          tmdbId: item.tmdb_id,
          mediaType: item.media_type,
          title,
          posterUrl: tmdbImageUrl(details.poster_path, "w342", imageProxyEnabled),
          createdAt: item.created_at,
        };
      })
    )).filter(Boolean);

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
        showWatched: profile.showWatched,
        createdAt: profile.createdAt,
      },
      stats,
      lists,
      watchedItems,
      friendStatus,
      mutualInsights,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to load profile" }, { status: 500 });
  }
}
