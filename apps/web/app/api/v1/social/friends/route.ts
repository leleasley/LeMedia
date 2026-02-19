import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { logger } from "@/lib/logger";
import { requireCsrf } from "@/lib/csrf";
import { getUserByUsername, upsertUser } from "@/db";
import {
  getFriends, sendFriendRequest, respondToFriendRequest, removeFriend,
  getPendingFriendRequests, getSentFriendRequests, getPendingFriendRequestCount,
  getFriendCount, checkRateLimit, recordRateLimitAction, createSocialNotification,
  getUserProfileById, cancelFriendRequest,
} from "@/db-social";

async function resolveUserId() {
  const user = await getUser().catch(() => null);
  if (!user) throw new Error("Unauthorized");
  const dbUser = await getUserByUsername(user.username);
  if (dbUser) return { id: dbUser.id, username: user.username };
  const created = await upsertUser(user.username, user.groups);
  return { id: created.id, username: user.username };
}

// GET /api/v1/social/friends - get friends list plus pending requests
export async function GET(req: NextRequest) {
  try {
    const { id: userId } = await resolveUserId();
    const url = new URL(req.url);
    const view = url.searchParams.get("view") || "all"; // all | pending | sent

    if (view === "pending") {
      const requests = await getPendingFriendRequests(userId);
      return NextResponse.json({ requests });
    }

    if (view === "sent") {
      const requests = await getSentFriendRequests(userId);
      return NextResponse.json({ requests });
    }

    const [friends, pendingCount, friendCount] = await Promise.all([
      getFriends(userId),
      getPendingFriendRequestCount(userId),
      getFriendCount(userId),
    ]);

    return NextResponse.json({ friends, pendingCount, friendCount });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Unable to load friends" }, { status: 500 });
  }
}

const FriendActionSchema = z.object({
  action: z.enum(["send_request", "accept", "decline", "remove", "cancel_request"]),
  targetUserId: z.coerce.number().optional(),
  requestId: z.coerce.number().optional(),
  message: z.string().max(200).optional(),
});

const KNOWN_CLIENT_ERRORS = new Set([
  "targetUserId required", "requestId required",
  "Cannot send friend request to yourself",
  "Cannot send friend request", "Already friends",
  "User not found", "User is not accepting friend requests",
  "Friend request not found or already responded",
  "Friend request not found to cancel",
]);

// POST /api/v1/social/friends - friend actions
export async function POST(req: NextRequest) {
  try {
    const { id: userId, username } = await resolveUserId();
    const csrf = requireCsrf(req);
    if (csrf) return csrf;

    const body = await req.json();
    const parsed = FriendActionSchema.parse(body);

    switch (parsed.action) {
      case "send_request": {
        if (!parsed.targetUserId) {
          return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
        }
        if (parsed.targetUserId === userId) {
          return NextResponse.json({ error: "Cannot send friend request to yourself" }, { status: 400 });
        }

        // Rate limit: 20 friend requests per hour
        const allowed = await checkRateLimit(userId, "friend_request", 20, 60);
        if (!allowed) {
          return NextResponse.json({ error: "Too many friend requests. Please try again later." }, { status: 429 });
        }

        const request = await sendFriendRequest(userId, parsed.targetUserId, parsed.message);
        await recordRateLimitAction(userId, "friend_request");

        // Notify target user
        const senderProfile = await getUserProfileById(userId);
        await createSocialNotification(
          parsed.targetUserId,
          "friend_request",
          "New Friend Request",
          `${senderProfile?.displayName || username} sent you a friend request`,
          "/friends",
          { fromUserId: userId, fromUsername: username }
        );

        return NextResponse.json({ request }, { status: 201 });
      }

      case "accept": {
        if (!parsed.requestId) {
          return NextResponse.json({ error: "requestId required" }, { status: 400 });
        }
        await respondToFriendRequest(parsed.requestId, userId, true);

        return NextResponse.json({ success: true });
      }

      case "decline": {
        if (!parsed.requestId) {
          return NextResponse.json({ error: "requestId required" }, { status: 400 });
        }
        await respondToFriendRequest(parsed.requestId, userId, false);
        return NextResponse.json({ success: true });
      }

      case "remove": {
        if (!parsed.targetUserId) {
          return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
        }
        await removeFriend(userId, parsed.targetUserId);
        return NextResponse.json({ success: true });
      }

      case "cancel_request": {
        if (!parsed.targetUserId) {
          return NextResponse.json({ error: "targetUserId required" }, { status: 400 });
        }
        await cancelFriendRequest(userId, parsed.targetUserId);

        // Notify target user
        const senderProfile = await getUserProfileById(userId);
        await createSocialNotification(
          parsed.targetUserId,
          "friend_request_cancelled",
          "Friend Request Withdrawn",
          `${senderProfile?.displayName || username} withdrew their friend request`,
          "/friends",
          { fromUserId: userId, fromUsername: username }
        );

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (err instanceof z.ZodError) {
      logger.warn("[social/friends] Invalid request payload", { issues: err.issues });
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    if (err instanceof Error && KNOWN_CLIENT_ERRORS.has(err.message))
      return NextResponse.json({ error: err.message }, { status: 400 });
    logger.error("[social/friends] Unexpected error", err);
    return NextResponse.json({ error: "Unable to process friend action" }, { status: 500 });
  }
}
