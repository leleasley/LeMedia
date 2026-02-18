/**
 * Social Data Access Layer
 * All database functions for the social system: profiles, friends, feed,
 * list reactions/comments/saves, blocks, reports, rate limiting.
 */
import { getPool } from "@/db";
import { logger } from "@/lib/logger";

// ============================================================
// TYPES
// ============================================================

export interface UserProfile {
  id: number;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  jellyfinUserId: string | null;
  bannerUrl: string | null;
  profileVisibility: "public" | "friends" | "private";
  showActivity: boolean;
  allowFriendRequests: boolean;
  showStats: boolean;
  showLists: boolean;
  createdAt: string;
  lastSeenAt: string;
}

export interface FriendRequest {
  id: number;
  fromUserId: number;
  toUserId: number;
  status: "pending" | "accepted" | "declined";
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
  fromUsername: string;
  fromDisplayName: string | null;
  fromAvatarUrl: string | null;
  fromJellyfinUserId: string | null;
  toUsername: string;
  toDisplayName: string | null;
  toAvatarUrl: string | null;
  toJellyfinUserId: string | null;
}

export interface Friend {
  userId: number;
  friendId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  jellyfinUserId: string | null;
  bio: string | null;
  createdAt: string;
  lastSeenAt: string;
  friendSince: string;
}

export interface SocialEvent {
  id: number;
  userId: number;
  eventType: string;
  targetType: string | null;
  targetId: number | null;
  metadata: Record<string, unknown>;
  visibility: "friends" | "public";
  createdAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  jellyfinUserId: string | null;
}

export interface ListComment {
  id: number;
  listId: number;
  userId: number;
  parentId: number | null;
  content: string;
  edited: boolean;
  createdAt: string;
  updatedAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  jellyfinUserId: string | null;
  replyCount?: number;
}

export interface ListReaction {
  id: number;
  listId: number;
  userId: number;
  reaction: string;
  createdAt: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ListReactionSummary {
  reaction: string;
  count: number;
  userReacted: boolean;
}

export interface ListSave {
  id: number;
  originalListId: number;
  userId: number;
  savedListId: number | null;
  isRemix: boolean;
  createdAt: string;
}

export interface UserSearchResult {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  avatarVersion: number;
  jellyfinUserId: string | null;
  bio: string | null;
  friendStatus: "none" | "friends" | "pending_sent" | "pending_received";
  mutualFriends: number;
}

export interface ListWithSocialMeta {
  id: number;
  userId: number;
  name: string;
  description: string | null;
  visibility: string;
  shareId: string;
  shareSlug: string | null;
  mood: string | null;
  occasion: string | null;
  coverTmdbId: number | null;
  coverMediaType: string | null;
  customCoverImagePath: string | null;
  itemCount: number;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  pinned: boolean;
  allowComments: boolean;
  allowReactions: boolean;
  allowRemix: boolean;
  createdAt: string;
  updatedAt: string;
  ownerUsername: string;
  ownerDisplayName: string | null;
  ownerAvatarUrl: string | null;
}

export interface MutualTasteInsight {
  overlapPercentage: number;
  sharedListCount: number;
  sharedGenres: string[];
  sharedMediaCount: number;
}

// ============================================================
// USER PROFILE
// ============================================================

export async function getUserProfile(username: string): Promise<UserProfile | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, username, display_name as "displayName", bio, 
            avatar_url as "avatarUrl", avatar_version as "avatarVersion",
            jellyfin_user_id as "jellyfinUserId",
            banner_url as "bannerUrl",
            profile_visibility as "profileVisibility",
            show_activity as "showActivity", allow_friend_requests as "allowFriendRequests",
            show_stats as "showStats", show_lists as "showLists",
            created_at as "createdAt", last_seen_at as "lastSeenAt"
     FROM app_user WHERE lower(username) = lower($1) AND (banned IS NULL OR banned = false)`,
    [username]
  );
  return res.rows[0] || null;
}

export async function getUserProfileById(userId: number): Promise<UserProfile | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT id, username, display_name as "displayName", bio,
            avatar_url as "avatarUrl", avatar_version as "avatarVersion",
            jellyfin_user_id as "jellyfinUserId",
            banner_url as "bannerUrl",
            profile_visibility as "profileVisibility",
            show_activity as "showActivity", allow_friend_requests as "allowFriendRequests",
            show_stats as "showStats", show_lists as "showLists",
            created_at as "createdAt", last_seen_at as "lastSeenAt"
     FROM app_user WHERE id = $1 AND (banned IS NULL OR banned = false)`,
    [userId]
  );
  return res.rows[0] || null;
}

export async function updateUserProfile(
  userId: number,
  updates: {
    bio?: string | null;
    bannerUrl?: string | null;
    displayName?: string | null;
    profileVisibility?: "public" | "friends" | "private";
    showActivity?: boolean;
    allowFriendRequests?: boolean;
    showStats?: boolean;
    showLists?: boolean;
  }
): Promise<UserProfile | null> {
  const p = getPool();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (updates.bio !== undefined) { sets.push(`bio = $${idx++}`); vals.push(updates.bio); }
  if (updates.bannerUrl !== undefined) { sets.push(`banner_url = $${idx++}`); vals.push(updates.bannerUrl); }
  if (updates.displayName !== undefined) { sets.push(`display_name = $${idx++}`); vals.push(updates.displayName); }
  if (updates.profileVisibility !== undefined) { sets.push(`profile_visibility = $${idx++}`); vals.push(updates.profileVisibility); }
  if (updates.showActivity !== undefined) { sets.push(`show_activity = $${idx++}`); vals.push(updates.showActivity); }
  if (updates.allowFriendRequests !== undefined) { sets.push(`allow_friend_requests = $${idx++}`); vals.push(updates.allowFriendRequests); }
  if (updates.showStats !== undefined) { sets.push(`show_stats = $${idx++}`); vals.push(updates.showStats); }
  if (updates.showLists !== undefined) { sets.push(`show_lists = $${idx++}`); vals.push(updates.showLists); }

  if (sets.length === 0) return getUserProfileById(userId);

  vals.push(userId);
  await p.query(`UPDATE app_user SET ${sets.join(", ")} WHERE id = $${idx}`, vals);
  return getUserProfileById(userId);
}

// ============================================================
// FRIEND SYSTEM
// ============================================================

export async function sendFriendRequest(fromUserId: number, toUserId: number, message?: string): Promise<FriendRequest> {
  const p = getPool();
  if (fromUserId === toUserId) throw new Error("Cannot send friend request to yourself");

  // Check if blocked
  const blocked = await p.query(
    `SELECT 1 FROM user_block WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [fromUserId, toUserId]
  );
  if (blocked.rows.length > 0) throw new Error("Cannot send friend request");

  // Check if already friends
  const existing = await p.query(
    `SELECT 1 FROM friend_edge WHERE user_id = $1 AND friend_id = $2`,
    [fromUserId, toUserId]
  );
  if (existing.rows.length > 0) throw new Error("Already friends");

  // Check target allows friend requests
  const target = await p.query(
    `SELECT allow_friend_requests FROM app_user WHERE id = $1`,
    [toUserId]
  );
  if (target.rows.length === 0) throw new Error("User not found");
  if (!target.rows[0].allow_friend_requests) throw new Error("User is not accepting friend requests");

  const res = await p.query(
    `INSERT INTO friend_request (from_user_id, to_user_id, message)
     VALUES ($1, $2, $3)
     ON CONFLICT (from_user_id, to_user_id) DO UPDATE SET status = 'pending', message = $3, created_at = NOW(), responded_at = NULL
     RETURNING id, from_user_id as "fromUserId", to_user_id as "toUserId", status, message, created_at as "createdAt"`,
    [fromUserId, toUserId, message || null]
  );

  return res.rows[0];
}

export async function respondToFriendRequest(
  requestId: number,
  userId: number,
  accept: boolean
): Promise<void> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");

    const req = await client.query(
      `UPDATE friend_request SET status = $1, responded_at = NOW()
       WHERE id = $2 AND to_user_id = $3 AND status = 'pending'
       RETURNING from_user_id, to_user_id`,
      [accept ? "accepted" : "declined", requestId, userId]
    );

    if (req.rows.length === 0) throw new Error("Friend request not found or already responded");

    if (accept) {
      const { from_user_id, to_user_id } = req.rows[0];
      // Insert bidirectional edges
      await client.query(
        `INSERT INTO friend_edge (user_id, friend_id) VALUES ($1, $2), ($2, $1)
         ON CONFLICT DO NOTHING`,
        [from_user_id, to_user_id]
      );

      // Create social event
      await client.query(
        `INSERT INTO social_event (user_id, event_type, target_type, target_id, metadata, visibility)
         VALUES ($1, 'became_friends', 'user', $2, $3, 'friends'),
                ($2, 'became_friends', 'user', $1, $4, 'friends')`,
        [
          from_user_id, to_user_id,
          JSON.stringify({ friendUsername: (await getUserProfileById(to_user_id))?.username }),
          JSON.stringify({ friendUsername: (await getUserProfileById(from_user_id))?.username }),
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function removeFriend(userId: number, friendId: number): Promise<void> {
  const p = getPool();
  await p.query(
    `DELETE FROM friend_edge WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
    [userId, friendId]
  );
  // Also clean up any pending requests
  await p.query(
    `DELETE FROM friend_request WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)`,
    [userId, friendId]
  );
}

export async function cancelFriendRequest(fromUserId: number, toUserId: number): Promise<void> {
  const p = getPool();
  const res = await p.query(
    `DELETE FROM friend_request WHERE from_user_id = $1 AND to_user_id = $2 AND status = 'pending'`,
    [fromUserId, toUserId]
  );
  if (res.rowCount === 0) throw new Error("Friend request not found to cancel");
}

export async function getFriends(userId: number): Promise<Friend[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT fe.user_id as "userId", fe.friend_id as "friendId",
            u.username, u.display_name as "displayName",
            u.avatar_url as "avatarUrl", u.avatar_version as "avatarVersion",
            u.jellyfin_user_id as "jellyfinUserId",
            u.bio, u.created_at as "createdAt", u.last_seen_at as "lastSeenAt",
            fe.created_at as "friendSince"
     FROM friend_edge fe
     JOIN app_user u ON u.id = fe.friend_id
     WHERE fe.user_id = $1 AND (u.banned IS NULL OR u.banned = false)
     ORDER BY u.username ASC`,
    [userId]
  );
  return res.rows;
}

export async function getFriendCount(userId: number): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*) as count FROM friend_edge WHERE user_id = $1`,
    [userId]
  );
  return parseInt(res.rows[0].count, 10);
}

export async function areFriends(userId: number, otherUserId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `SELECT 1 FROM friend_edge WHERE user_id = $1 AND friend_id = $2`,
    [userId, otherUserId]
  );
  return res.rows.length > 0;
}

export async function getPendingFriendRequests(userId: number): Promise<FriendRequest[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT fr.id, fr.from_user_id as "fromUserId", fr.to_user_id as "toUserId",
            fr.status, fr.message, fr.created_at as "createdAt", fr.responded_at as "respondedAt",
            fu.username as "fromUsername", fu.display_name as "fromDisplayName", fu.avatar_url as "fromAvatarUrl",
            fu.jellyfin_user_id as "fromJellyfinUserId",
            tu.username as "toUsername", tu.display_name as "toDisplayName", tu.avatar_url as "toAvatarUrl",
            tu.jellyfin_user_id as "toJellyfinUserId"
     FROM friend_request fr
     JOIN app_user fu ON fu.id = fr.from_user_id
     JOIN app_user tu ON tu.id = fr.to_user_id
     WHERE fr.to_user_id = $1 AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function getSentFriendRequests(userId: number): Promise<FriendRequest[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT fr.id, fr.from_user_id as "fromUserId", fr.to_user_id as "toUserId",
            fr.status, fr.message, fr.created_at as "createdAt", fr.responded_at as "respondedAt",
            fu.username as "fromUsername", fu.display_name as "fromDisplayName", fu.avatar_url as "fromAvatarUrl",
            fu.jellyfin_user_id as "fromJellyfinUserId",
            tu.username as "toUsername", tu.display_name as "toDisplayName", tu.avatar_url as "toAvatarUrl",
            tu.jellyfin_user_id as "toJellyfinUserId"
     FROM friend_request fr
     JOIN app_user fu ON fu.id = fr.from_user_id
     JOIN app_user tu ON tu.id = fr.to_user_id
     WHERE fr.from_user_id = $1 AND fr.status = 'pending'
     ORDER BY fr.created_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function getPendingFriendRequestCount(userId: number): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*) as count FROM friend_request WHERE to_user_id = $1 AND status = 'pending'`,
    [userId]
  );
  return parseInt(res.rows[0].count, 10);
}

// ============================================================
// BLOCK SYSTEM
// ============================================================

export async function blockUser(blockerId: number, blockedId: number, reason?: string): Promise<void> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    // Add block
    await client.query(
      `INSERT INTO user_block (blocker_id, blocked_id, reason) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [blockerId, blockedId, reason || null]
    );
    // Remove friendship if exists
    await client.query(
      `DELETE FROM friend_edge WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)`,
      [blockerId, blockedId]
    );
    // Remove pending requests
    await client.query(
      `DELETE FROM friend_request WHERE (from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1)`,
      [blockerId, blockedId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function unblockUser(blockerId: number, blockedId: number): Promise<void> {
  const p = getPool();
  await p.query(
    `DELETE FROM user_block WHERE blocker_id = $1 AND blocked_id = $2`,
    [blockerId, blockedId]
  );
}

export async function getBlockedUsers(userId: number): Promise<{ blockedId: number; username: string; displayName: string | null; avatarUrl: string | null; jellyfinUserId: string | null; createdAt: string }[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT ub.blocked_id as "blockedId", u.username, u.display_name as "displayName",
            u.avatar_url as "avatarUrl", u.jellyfin_user_id as "jellyfinUserId", ub.created_at as "createdAt"
     FROM user_block ub
     JOIN app_user u ON u.id = ub.blocked_id
     WHERE ub.blocker_id = $1
     ORDER BY ub.created_at DESC`,
    [userId]
  );
  return res.rows;
}

export async function isBlocked(userId: number, otherUserId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `SELECT 1 FROM user_block WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
    [userId, otherUserId]
  );
  return res.rows.length > 0;
}

// ============================================================
// LIST REACTIONS
// ============================================================

export async function addListReaction(listId: number, userId: number, reaction: string = "like"): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO list_reaction (list_id, user_id, reaction) VALUES ($1, $2, $3)
     ON CONFLICT (list_id, user_id, reaction) DO NOTHING`,
    [listId, userId, reaction]
  );
}

export async function removeListReaction(listId: number, userId: number, reaction: string = "like"): Promise<void> {
  const p = getPool();
  await p.query(
    `DELETE FROM list_reaction WHERE list_id = $1 AND user_id = $2 AND reaction = $3`,
    [listId, userId, reaction]
  );
}

export async function getListReactions(listId: number, currentUserId?: number): Promise<ListReactionSummary[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT reaction, COUNT(*) as count,
            BOOL_OR(user_id = $2) as "userReacted"
     FROM list_reaction WHERE list_id = $1
     GROUP BY reaction ORDER BY count DESC`,
    [listId, currentUserId || 0]
  );
  return res.rows.map((r: { reaction: string; count: string; userReacted: boolean }) => ({
    reaction: r.reaction,
    count: parseInt(r.count, 10),
    userReacted: r.userReacted || false,
  }));
}

export async function getListReactionUsers(listId: number, reaction: string, limit: number = 20): Promise<{ userId: number; username: string; displayName: string | null; avatarUrl: string | null }[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT lr.user_id as "userId", u.username, u.display_name as "displayName", u.avatar_url as "avatarUrl"
     FROM list_reaction lr JOIN app_user u ON u.id = lr.user_id
     WHERE lr.list_id = $1 AND lr.reaction = $2
     ORDER BY lr.created_at DESC LIMIT $3`,
    [listId, reaction, limit]
  );
  return res.rows;
}

// ============================================================
// LIST COMMENTS
// ============================================================

export async function addListComment(listId: number, userId: number, content: string, parentId?: number): Promise<ListComment> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO list_comment (list_id, user_id, content, parent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, list_id as "listId", user_id as "userId", parent_id as "parentId",
               content, edited, created_at as "createdAt", updated_at as "updatedAt"`,
    [listId, userId, content, parentId || null]
  );
  const comment = res.rows[0];
  // Fetch author info
  const user = await p.query(
    `SELECT username, display_name as "displayName", avatar_url as "avatarUrl", avatar_version as "avatarVersion",
            jellyfin_user_id as "jellyfinUserId"
     FROM app_user WHERE id = $1`,
    [userId]
  );
  return { ...comment, ...user.rows[0], replyCount: 0 };
}

export async function updateListComment(listId: number, commentId: number, userId: number, content: string): Promise<ListComment | null> {
  const p = getPool();
  const res = await p.query(
    `UPDATE list_comment SET content = $1, edited = true, updated_at = NOW()
     WHERE list_id = $2 AND id = $3 AND user_id = $4
     RETURNING id, list_id as "listId", user_id as "userId", parent_id as "parentId",
               content, edited, created_at as "createdAt", updated_at as "updatedAt"`,
    [content, listId, commentId, userId]
  );
  if (res.rows.length === 0) return null;
  const comment = res.rows[0];
  const user = await p.query(
    `SELECT username, display_name as "displayName", avatar_url as "avatarUrl", avatar_version as "avatarVersion",
            jellyfin_user_id as "jellyfinUserId"
     FROM app_user WHERE id = $1`,
    [userId]
  );
  return { ...comment, ...user.rows[0] };
}

export async function deleteListComment(listId: number, commentId: number, userId: number, isAdmin: boolean = false): Promise<boolean> {
  const p = getPool();
  let res;
  if (isAdmin) {
    res = await p.query(`DELETE FROM list_comment WHERE list_id = $1 AND id = $2`, [listId, commentId]);
  } else {
    res = await p.query(`DELETE FROM list_comment WHERE list_id = $1 AND id = $2 AND user_id = $3`, [listId, commentId, userId]);
  }
  return (res.rowCount ?? 0) > 0;
}

export async function getListComments(listId: number, parentId: number | null = null, limit: number = 50, offset: number = 0): Promise<ListComment[]> {
  const p = getPool();
  if (parentId === null) {
    const res = await p.query(
      `SELECT lc.id, lc.list_id as "listId", lc.user_id as "userId", lc.parent_id as "parentId",
              lc.content, lc.edited, lc.created_at as "createdAt", lc.updated_at as "updatedAt",
              u.username, u.display_name as "displayName", u.avatar_url as "avatarUrl", u.avatar_version as "avatarVersion",
              u.jellyfin_user_id as "jellyfinUserId",
              (SELECT COUNT(*) FROM list_comment r WHERE r.parent_id = lc.id)::int as "replyCount"
       FROM list_comment lc
       JOIN app_user u ON u.id = lc.user_id
       WHERE lc.list_id = $1 AND lc.parent_id IS NULL
       ORDER BY lc.created_at ASC
       LIMIT $2 OFFSET $3`,
      [listId, limit, offset]
    );
    return res.rows;
  } else {
    const res = await p.query(
      `SELECT lc.id, lc.list_id as "listId", lc.user_id as "userId", lc.parent_id as "parentId",
              lc.content, lc.edited, lc.created_at as "createdAt", lc.updated_at as "updatedAt",
              u.username, u.display_name as "displayName", u.avatar_url as "avatarUrl", u.avatar_version as "avatarVersion",
              u.jellyfin_user_id as "jellyfinUserId",
              (SELECT COUNT(*) FROM list_comment r WHERE r.parent_id = lc.id)::int as "replyCount"
       FROM list_comment lc
       JOIN app_user u ON u.id = lc.user_id
       WHERE lc.list_id = $1 AND lc.parent_id = $4
       ORDER BY lc.created_at ASC
       LIMIT $2 OFFSET $3`,
      [listId, limit, offset, parentId]
    );
    return res.rows;
  }
}

export async function getListCommentCount(listId: number): Promise<number> {
  const p = getPool();
  const res = await p.query(`SELECT COUNT(*) as count FROM list_comment WHERE list_id = $1`, [listId]);
  return parseInt(res.rows[0].count, 10);
}

// ============================================================
// LIST SAVES / REMIXES
// ============================================================

export async function saveList(originalListId: number, userId: number): Promise<ListSave> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO list_save (original_list_id, user_id) VALUES ($1, $2)
     ON CONFLICT (original_list_id, user_id) DO NOTHING
     RETURNING id, original_list_id as "originalListId", user_id as "userId",
               saved_list_id as "savedListId", is_remix as "isRemix", created_at as "createdAt"`,
    [originalListId, userId]
  );
  if (res.rows.length === 0) {
    // Already saved
    const existing = await p.query(
      `SELECT id, original_list_id as "originalListId", user_id as "userId",
              saved_list_id as "savedListId", is_remix as "isRemix", created_at as "createdAt"
       FROM list_save WHERE original_list_id = $1 AND user_id = $2`,
      [originalListId, userId]
    );
    return existing.rows[0];
  }
  return res.rows[0];
}

export async function unsaveList(originalListId: number, userId: number): Promise<void> {
  const p = getPool();
  await p.query(
    `DELETE FROM list_save WHERE original_list_id = $1 AND user_id = $2`,
    [originalListId, userId]
  );
}

export async function hasUserSavedList(originalListId: number, userId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `SELECT 1 FROM list_save WHERE original_list_id = $1 AND user_id = $2`,
    [originalListId, userId]
  );
  return res.rows.length > 0;
}

export async function remixList(originalListId: number, userId: number, newListId: number): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO list_save (original_list_id, user_id, saved_list_id, is_remix) VALUES ($1, $2, $3, true)
     ON CONFLICT (original_list_id, user_id)
     DO UPDATE SET saved_list_id = $3, is_remix = true`,
    [originalListId, userId, newListId]
  );
}

// ============================================================
// SOCIAL FEED
// ============================================================

export async function createSocialEvent(
  userId: number,
  eventType: string,
  targetType: string | null,
  targetId: number | null,
  metadata: Record<string, unknown> = {},
  visibility: "friends" | "public" = "friends"
): Promise<SocialEvent> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO social_event (user_id, event_type, target_type, target_id, metadata, visibility)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, user_id as "userId", event_type as "eventType", target_type as "targetType",
               target_id as "targetId", metadata, visibility, created_at as "createdAt"`,
    [userId, eventType, targetType, targetId, JSON.stringify(metadata), visibility]
  );
  return res.rows[0];
}

export async function getFriendsFeed(
  userId: number,
  limit: number = 30,
  before?: string
): Promise<SocialEvent[]> {
  const p = getPool();
  const params: unknown[] = [userId, limit];
  let whereClause = `(
    se.user_id = $1
    OR (se.visibility = 'friends' AND se.user_id IN (SELECT friend_id FROM friend_edge WHERE user_id = $1))
    OR se.visibility = 'public'
  )
  AND (u.banned IS NULL OR u.banned = false)
  AND (u.show_activity = TRUE OR se.user_id = $1)
  AND se.user_id NOT IN (SELECT blocked_id FROM user_block WHERE blocker_id = $1)
  AND se.user_id NOT IN (SELECT blocker_id FROM user_block WHERE blocked_id = $1)`;

  if (before) {
    params.push(before);
    whereClause += ` AND se.created_at < $3`;
  }

  const res = await p.query(
    `SELECT se.id, se.user_id as "userId", se.event_type as "eventType",
            se.target_type as "targetType", se.target_id as "targetId",
            se.metadata, se.visibility, se.created_at as "createdAt",
            u.username, u.display_name as "displayName", u.avatar_url as "avatarUrl",
            u.jellyfin_user_id as "jellyfinUserId"
     FROM social_event se
     JOIN app_user u ON u.id = se.user_id
     WHERE ${whereClause}
     ORDER BY se.created_at DESC
     LIMIT $2`,
    params
  );
  return res.rows;
}

export async function getPublicFeed(limit: number = 30, before?: string): Promise<SocialEvent[]> {
  const p = getPool();
  const params: unknown[] = [limit];
  let whereClause = `se.visibility = 'public'
    AND (u.banned IS NULL OR u.banned = false)
    AND u.show_activity = TRUE`;

  if (before) {
    params.push(before);
    whereClause += ` AND se.created_at < $2`;
  }

  const res = await p.query(
    `SELECT se.id, se.user_id as "userId", se.event_type as "eventType",
            se.target_type as "targetType", se.target_id as "targetId",
            se.metadata, se.visibility, se.created_at as "createdAt",
            u.username, u.display_name as "displayName", u.avatar_url as "avatarUrl",
            u.jellyfin_user_id as "jellyfinUserId"
     FROM social_event se
     JOIN app_user u ON u.id = se.user_id
     WHERE ${whereClause}
     ORDER BY se.created_at DESC
     LIMIT $1`,
    params
  );
  return res.rows;
}

// ============================================================
// USER SEARCH / DISCOVERY
// ============================================================

export async function searchUsers(
  query: string,
  currentUserId: number,
  options: { limit?: number; offset?: number; friendsOnly?: boolean } = {}
): Promise<UserSearchResult[]> {
  const p = getPool();
  const limit = options.limit || 20;
  const offset = options.offset || 0;
  const params: unknown[] = [`%${query}%`, currentUserId, limit, offset];

  let friendFilter = "";
  if (options.friendsOnly) {
    friendFilter = `AND u.id IN (SELECT friend_id FROM friend_edge WHERE user_id = $2)`;
  }

  const res = await p.query(
    `SELECT u.id, u.username, u.display_name as "displayName",
            u.avatar_url as "avatarUrl", u.avatar_version as "avatarVersion",
            u.jellyfin_user_id as "jellyfinUserId", u.bio,
            CASE
              WHEN fe.friend_id IS NOT NULL THEN 'friends'
              WHEN fr_sent.id IS NOT NULL THEN 'pending_sent'
              WHEN fr_recv.id IS NOT NULL THEN 'pending_received'
              ELSE 'none'
            END as "friendStatus",
            COALESCE(mf.count, 0)::int as "mutualFriends"
     FROM app_user u
     LEFT JOIN friend_edge fe ON fe.user_id = $2 AND fe.friend_id = u.id
     LEFT JOIN friend_request fr_sent ON fr_sent.from_user_id = $2 AND fr_sent.to_user_id = u.id AND fr_sent.status = 'pending'
     LEFT JOIN friend_request fr_recv ON fr_recv.from_user_id = u.id AND fr_recv.to_user_id = $2 AND fr_recv.status = 'pending'
     LEFT JOIN LATERAL (
       SELECT COUNT(*) as count FROM friend_edge a
       JOIN friend_edge b ON b.friend_id = a.friend_id
       WHERE a.user_id = u.id AND b.user_id = $2 AND a.friend_id != $2
     ) mf ON true
     WHERE (lower(u.username) LIKE lower($1) OR lower(u.display_name) LIKE lower($1))
       AND u.id != $2
       AND (u.banned IS NULL OR u.banned = false)
       AND u.id NOT IN (SELECT blocked_id FROM user_block WHERE blocker_id = $2)
       AND u.id NOT IN (SELECT blocker_id FROM user_block WHERE blocked_id = $2)
       ${friendFilter}
     ORDER BY
       CASE WHEN fe.friend_id IS NOT NULL THEN 0 ELSE 1 END,
       mf.count DESC,
       u.username ASC
     LIMIT $3 OFFSET $4`,
    params
  );
  return res.rows;
}

export async function discoverUsers(
  currentUserId: number,
  options: { limit?: number; offset?: number; filter?: "trending" | "similar" | "new" } = {}
): Promise<UserSearchResult[]> {
  const p = getPool();
  const limit = options.limit || 20;
  const offset = options.offset || 0;

  let orderClause = "u.last_seen_at DESC";
  let extraWhere = "";

  if (options.filter === "trending") {
    orderClause = `(SELECT COUNT(*) FROM social_event se WHERE se.user_id = u.id AND se.created_at > NOW() - INTERVAL '7 days') DESC`;
  } else if (options.filter === "new") {
    orderClause = "u.created_at DESC";
  } else if (options.filter === "similar") {
    // Users who have the most mutual friends
    orderClause = "mf.count DESC NULLS LAST, u.last_seen_at DESC";
  }

  const res = await p.query(
    `SELECT u.id, u.username, u.display_name as "displayName",
            u.avatar_url as "avatarUrl", u.avatar_version as "avatarVersion",
            u.jellyfin_user_id as "jellyfinUserId", u.bio,
            CASE
              WHEN fe.friend_id IS NOT NULL THEN 'friends'
              WHEN fr_sent.id IS NOT NULL THEN 'pending_sent'
              WHEN fr_recv.id IS NOT NULL THEN 'pending_received'
              ELSE 'none'
            END as "friendStatus",
            COALESCE(mf.count, 0)::int as "mutualFriends"
     FROM app_user u
     LEFT JOIN friend_edge fe ON fe.user_id = $1 AND fe.friend_id = u.id
     LEFT JOIN friend_request fr_sent ON fr_sent.from_user_id = $1 AND fr_sent.to_user_id = u.id AND fr_sent.status = 'pending'
     LEFT JOIN friend_request fr_recv ON fr_recv.from_user_id = u.id AND fr_recv.to_user_id = $1 AND fr_recv.status = 'pending'
     LEFT JOIN LATERAL (
       SELECT COUNT(*) as count FROM friend_edge a
       JOIN friend_edge b ON b.friend_id = a.friend_id
       WHERE a.user_id = u.id AND b.user_id = $1 AND a.friend_id != $1
     ) mf ON true
     WHERE u.id != $1
       AND (u.banned IS NULL OR u.banned = false)
       AND u.profile_visibility = 'public'
       AND u.id NOT IN (SELECT blocked_id FROM user_block WHERE blocker_id = $1)
       AND u.id NOT IN (SELECT blocker_id FROM user_block WHERE blocked_id = $1)
       ${extraWhere}
     ORDER BY ${orderClause}
     LIMIT $2 OFFSET $3`,
    [currentUserId, limit, offset]
  );
  return res.rows;
}

// ============================================================
// PUBLIC LISTS (for profiles)
// ============================================================

export async function getPublicListsForUser(
  profileUserId: number,
  viewerUserId: number | null,
  options: { sort?: "recent" | "popular" | "pinned"; limit?: number; offset?: number } = {}
): Promise<ListWithSocialMeta[]> {
  const p = getPool();
  const limit = options.limit || 20;
  const offset = options.offset || 0;

  const isFriend = viewerUserId
    ? (await areFriends(profileUserId, viewerUserId))
    : false;
  const isSelf = viewerUserId === profileUserId;

  let visibilityFilter: string;
  if (isSelf) {
    visibilityFilter = "1=1"; // See all own lists
  } else if (isFriend) {
    visibilityFilter = "cl.visibility IN ('public', 'friends')";
  } else {
    visibilityFilter = "cl.visibility = 'public'";
  }

  let orderBy = "cl.updated_at DESC";
  if (options.sort === "popular") orderBy = "cl.like_count DESC, cl.updated_at DESC";
  if (options.sort === "pinned") orderBy = "cl.pinned DESC, cl.updated_at DESC";

  const res = await p.query(
    `SELECT cl.id, cl.user_id as "userId", cl.name, cl.description, cl.visibility,
            cl.share_id as "shareId", cl.share_slug as "shareSlug",
            cl.mood, cl.occasion,
            cl.cover_tmdb_id as "coverTmdbId", cl.cover_media_type as "coverMediaType",
            cl.custom_cover_image_path as "customCoverImagePath",
            cl.item_count as "itemCount", cl.like_count as "likeCount",
            cl.comment_count as "commentCount", cl.save_count as "saveCount",
            cl.pinned, cl.allow_comments as "allowComments",
            cl.allow_reactions as "allowReactions", cl.allow_remix as "allowRemix",
            cl.created_at as "createdAt", cl.updated_at as "updatedAt",
            u.username as "ownerUsername", u.display_name as "ownerDisplayName",
            u.avatar_url as "ownerAvatarUrl"
     FROM custom_list cl
     JOIN app_user u ON u.id = cl.user_id
     WHERE cl.user_id = $1 AND ${visibilityFilter}
     ORDER BY ${orderBy}
     LIMIT $2 OFFSET $3`,
    [profileUserId, limit, offset]
  );
  return res.rows;
}

export async function getListWithSocialMeta(listId: number): Promise<ListWithSocialMeta | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT cl.id, cl.user_id as "userId", cl.name, cl.description, cl.visibility,
            cl.share_id as "shareId", cl.share_slug as "shareSlug",
            cl.mood, cl.occasion,
            cl.cover_tmdb_id as "coverTmdbId", cl.cover_media_type as "coverMediaType",
            cl.custom_cover_image_path as "customCoverImagePath",
            cl.item_count as "itemCount", cl.like_count as "likeCount",
            cl.comment_count as "commentCount", cl.save_count as "saveCount",
            cl.pinned, cl.allow_comments as "allowComments",
            cl.allow_reactions as "allowReactions", cl.allow_remix as "allowRemix",
            cl.created_at as "createdAt", cl.updated_at as "updatedAt",
            u.username as "ownerUsername", u.display_name as "ownerDisplayName",
            u.avatar_url as "ownerAvatarUrl"
     FROM custom_list cl
     JOIN app_user u ON u.id = cl.user_id
     WHERE cl.id = $1`,
    [listId]
  );
  return res.rows[0] || null;
}

// ============================================================
// MUTUAL TASTE INSIGHTS
// ============================================================

export async function getMutualTasteInsights(userId: number, otherUserId: number): Promise<MutualTasteInsight> {
  const p = getPool();

  // Shared media (watchlists + favorites)
  const sharedMedia = await p.query(
    `SELECT COUNT(*) as count FROM user_media_list a
     JOIN user_media_list b ON a.media_type = b.media_type AND a.tmdb_id = b.tmdb_id AND a.list_type = b.list_type
     WHERE a.user_id = $1 AND b.user_id = $2`,
    [userId, otherUserId]
  );

  // Total unique media for each user
  const userMediaCount = await p.query(
    `SELECT COUNT(DISTINCT (media_type, tmdb_id)) as count FROM user_media_list WHERE user_id = $1`,
    [userId]
  );
  const otherMediaCount = await p.query(
    `SELECT COUNT(DISTINCT (media_type, tmdb_id)) as count FROM user_media_list WHERE user_id = $1`,
    [otherUserId]
  );

  const shared = parseInt(sharedMedia.rows[0].count, 10);
  const total = Math.max(
    parseInt(userMediaCount.rows[0].count, 10),
    parseInt(otherMediaCount.rows[0].count, 10),
    1
  );
  const overlapPercentage = Math.round((shared / total) * 100);

  // Shared lists (public lists that both users have saved)
  const sharedLists = await p.query(
    `SELECT COUNT(*) as count FROM list_save a
     JOIN list_save b ON a.original_list_id = b.original_list_id
     WHERE a.user_id = $1 AND b.user_id = $2`,
    [userId, otherUserId]
  );

  // Shared genres from reviews
  const sharedGenres = await p.query(
    `SELECT DISTINCT jsonb_array_elements_text(a.metadata->'genres') as genre
     FROM user_review a
     JOIN user_review b ON a.media_type = b.media_type AND a.tmdb_id = b.tmdb_id
     WHERE a.user_id = $1 AND b.user_id = $2 AND a.rating >= 4 AND b.rating >= 4
       AND a.metadata IS NOT NULL AND a.metadata->'genres' IS NOT NULL
     LIMIT 10`,
    [userId, otherUserId]
  ).catch(() => ({ rows: [] }));

  return {
    overlapPercentage,
    sharedMediaCount: shared,
    sharedListCount: parseInt(sharedLists.rows[0].count, 10),
    sharedGenres: sharedGenres.rows.map((r: { genre: string }) => r.genre),
  };
}

// ============================================================
// USER STATS (for profiles)
// ============================================================

export async function getUserSocialStats(userId: number): Promise<{
  friendCount: number;
  listCount: number;
  reviewCount: number;
  watchlistCount: number;
  favoriteCount: number;
}> {
  const p = getPool();
  const [friends, lists, reviews, watchlist, favorites] = await Promise.all([
    p.query(`SELECT COUNT(*) as count FROM friend_edge WHERE user_id = $1`, [userId]),
    p.query(`SELECT COUNT(*) as count FROM custom_list WHERE user_id = $1`, [userId]),
    p.query(`SELECT COUNT(*) as count FROM user_review WHERE user_id = $1`, [userId]),
    p.query(`SELECT COUNT(*) as count FROM user_media_list WHERE user_id = $1 AND list_type = 'watchlist'`, [userId]),
    p.query(`SELECT COUNT(*) as count FROM user_media_list WHERE user_id = $1 AND list_type = 'favorites'`, [userId]),
  ]);

  return {
    friendCount: parseInt(friends.rows[0].count, 10),
    listCount: parseInt(lists.rows[0].count, 10),
    reviewCount: parseInt(reviews.rows[0].count, 10),
    watchlistCount: parseInt(watchlist.rows[0].count, 10),
    favoriteCount: parseInt(favorites.rows[0].count, 10),
  };
}

// ============================================================
// REPORTS
// ============================================================

export async function createReport(
  reporterId: number,
  opts: {
    reportedUserId?: number;
    reportedListId?: number;
    reportedCommentId?: number;
    reason: string;
    description?: string;
  }
): Promise<{ id: number }> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO user_report (reporter_id, reported_user_id, reported_list_id, reported_comment_id, reason, description)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [reporterId, opts.reportedUserId || null, opts.reportedListId || null, opts.reportedCommentId || null, opts.reason, opts.description || null]
  );
  return res.rows[0];
}

// ============================================================
// RATE LIMITING
// ============================================================

export async function checkRateLimit(userId: number, action: string, maxCount: number, windowMinutes: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*) as count FROM rate_limit_log
     WHERE user_id = $1 AND action = $2 AND created_at > NOW() - ($3 || ' minutes')::interval`,
    [userId, action, windowMinutes]
  );
  return parseInt(res.rows[0].count, 10) < maxCount;
}

export async function recordRateLimitAction(userId: number, action: string): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO rate_limit_log (user_id, action) VALUES ($1, $2)`,
    [userId, action]
  );
}

// Cleanup old rate limit entries (call periodically)
export async function cleanupRateLimitLog(): Promise<void> {
  const p = getPool();
  await p.query(`DELETE FROM rate_limit_log WHERE created_at < NOW() - INTERVAL '1 hour'`);
}

// ============================================================
// SOCIAL NOTIFICATIONS HELPERS
// ============================================================

export async function createSocialNotification(
  userId: number,
  type: string,
  title: string,
  message: string,
  link?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO user_notification (user_id, type, title, message, link, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, type, title, message, link || null, metadata ? JSON.stringify(metadata) : null]
  );
}

/**
 * Check if a user can view a list based on visibility and friendship
 */
export async function canViewList(listUserId: number, viewerUserId: number | null, visibility: string): Promise<boolean> {
  if (visibility === "public") return true;
  if (!viewerUserId) return false;
  if (viewerUserId === listUserId) return true;
  if (visibility === "friends") return areFriends(listUserId, viewerUserId);
  return false; // private
}

/**
 * Get the friend status between two users
 */
export async function getFriendStatus(userId: number, otherUserId: number): Promise<"none" | "friends" | "pending_sent" | "pending_received" | "blocked"> {
  if (userId === otherUserId) return "none";
  const p = getPool();

  // Check block
  const block = await p.query(
    `SELECT 1 FROM user_block WHERE (blocker_id = $1 AND blocked_id = $2)`,
    [userId, otherUserId]
  );
  if (block.rows.length > 0) return "blocked";

  // Check friends
  const friend = await p.query(
    `SELECT 1 FROM friend_edge WHERE user_id = $1 AND friend_id = $2`,
    [userId, otherUserId]
  );
  if (friend.rows.length > 0) return "friends";

  // Check pending
  const sent = await p.query(
    `SELECT 1 FROM friend_request WHERE from_user_id = $1 AND to_user_id = $2 AND status = 'pending'`,
    [userId, otherUserId]
  );
  if (sent.rows.length > 0) return "pending_sent";

  const recv = await p.query(
    `SELECT 1 FROM friend_request WHERE from_user_id = $2 AND to_user_id = $1 AND status = 'pending'`,
    [userId, otherUserId]
  );
  if (recv.rows.length > 0) return "pending_received";

  return "none";
}
