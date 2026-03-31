import "server-only";

import { getPool } from "@/db";

export type WatchPartyMediaType = "movie" | "tv";
export type WatchPartyStatus = "active" | "ended" | "cancelled";

export type WatchPartySummary = {
  id: string;
  partySlug: string;
  mediaType: WatchPartyMediaType;
  tmdbId: number;
  mediaTitle: string;
  partyName: string;
  hostUserId: number;
  hostUsername: string;
  jellyfinItemId: string | null;
  maxViewers: number;
  messageRateLimitSeconds: number;
  chatModerationEnabled: boolean;
  blockedLanguageFilterEnabled: boolean;
  selectedSeasonNumber: number | null;
  selectedEpisodeNumber: number | null;
  selectedEpisodeTitle: string | null;
  selectedJellyfinItemId: string | null;
  isPaused: boolean;
  playbackPositionSeconds: number;
  playbackUpdatedAt: string | null;
  playbackUpdatedBy: number | null;
  theme: string;
  status: WatchPartyStatus;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  viewerCount: number;
};

export type WatchPartyParticipant = {
  partyId: string;
  userId: number;
  username: string;
  displayName: string | null;
  avatarUrl?: string | null;
  role: "host" | "member";
  canInvite: boolean;
  canPause: boolean;
  canModerateChat: boolean;
  chatMuted: boolean;
  chatColor: string;
  lastSeenAt: string | null;
  warnCount: number;
  joinedAt: string;
};

export type WatchPartyInvite = {
  id: string;
  partyId: string;
  userId: number;
  invitedByUserId: number;
  status: "pending" | "accepted" | "declined" | "revoked";
  canInvite: boolean;
  canPause: boolean;
  canModerateChat: boolean;
  chatMuted: boolean;
  message: string | null;
  createdAt: string;
  respondedAt: string | null;
};

export type WatchPartyJoinRequest = {
  id: string;
  partyId: string;
  requesterUserId: number;
  requesterUsername: string;
  requesterDisplayName: string | null;
  status: "pending" | "approved" | "denied";
  createdAt: string;
  resolvedAt: string | null;
};

export type WatchPartyMessage = {
  id: number;
  partyId: string;
  userId: number;
  username: string;
  displayName: string | null;
  chatColor: string;
  message: string;
  createdAt: string;
};

export type WatchPartyInviteCandidate = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type AdminWatchPartyRow = {
  id: string;
  partySlug: string;
  partyName: string;
  mediaType: WatchPartyMediaType;
  mediaTitle: string;
  hostUserId: number;
  hostUsername: string;
  status: WatchPartyStatus;
  viewerCount: number;
  messageCount: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  endedAt: string | null;
  theme: string;
};

const BASE_SELECT = `
  wp.id,
  wp.party_slug as "partySlug",
  wp.media_type as "mediaType",
  wp.tmdb_id as "tmdbId",
  wp.media_title as "mediaTitle",
  wp.party_name as "partyName",
  wp.host_user_id as "hostUserId",
  host.username as "hostUsername",
  wp.jellyfin_item_id as "jellyfinItemId",
  wp.max_viewers as "maxViewers",
  wp.message_rate_limit_seconds as "messageRateLimitSeconds",
  wp.chat_moderation_enabled as "chatModerationEnabled",
  wp.blocked_language_filter_enabled as "blockedLanguageFilterEnabled",
  wp.selected_season_number as "selectedSeasonNumber",
  wp.selected_episode_number as "selectedEpisodeNumber",
  wp.selected_episode_title as "selectedEpisodeTitle",
  wp.selected_jellyfin_item_id as "selectedJellyfinItemId",
  wp.is_paused as "isPaused",
  wp.playback_position_seconds as "playbackPositionSeconds",
  wp.playback_updated_at as "playbackUpdatedAt",
  wp.playback_updated_by as "playbackUpdatedBy",
  COALESCE(wp.theme, 'void') as "theme",
  wp.status,
  wp.ended_at as "endedAt",
  wp.created_at as "createdAt",
  wp.updated_at as "updatedAt",
  COALESCE(vc.viewer_count, 0)::int as "viewerCount"
`;

function slugifyPartyName(value: string) {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "party";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getViewerCount(partyId: string) {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*)::int AS count FROM watch_party_participant WHERE party_id = $1`,
    [partyId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function countActivePartiesForVod(mediaType: WatchPartyMediaType, tmdbId: number) {
  const p = getPool();
  const res = await p.query(
    `SELECT COUNT(*)::int AS count
     FROM watch_party
     WHERE media_type = $1 AND tmdb_id = $2 AND status = 'active'`,
    [mediaType, tmdbId]
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function listActivePartiesForVod(mediaType: WatchPartyMediaType, tmdbId: number): Promise<WatchPartySummary[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT ${BASE_SELECT}
     FROM watch_party wp
     JOIN app_user host ON host.id = wp.host_user_id
     LEFT JOIN (
       SELECT party_id, COUNT(*)::int AS viewer_count
       FROM watch_party_participant
       GROUP BY party_id
     ) vc ON vc.party_id = wp.id
     WHERE wp.media_type = $1 AND wp.tmdb_id = $2 AND wp.status = 'active'
     ORDER BY wp.created_at DESC`,
    [mediaType, tmdbId]
  );
  return res.rows;
}

export async function createWatchParty(input: {
  mediaType: WatchPartyMediaType;
  tmdbId: number;
  mediaTitle: string;
  partyName: string;
  hostUserId: number;
  jellyfinItemId?: string | null;
  maxViewers?: number;
  messageRateLimitSeconds?: number;
  selectedSeasonNumber?: number | null;
  selectedEpisodeNumber?: number | null;
  selectedEpisodeTitle?: string | null;
  selectedJellyfinItemId?: string | null;
}): Promise<WatchPartySummary> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const baseSlug = slugifyPartyName(input.partyName);
    let partySlug = baseSlug;
    for (let i = 0; i < 6; i += 1) {
      const exists = await client.query(`SELECT 1 FROM watch_party WHERE party_slug = $1 LIMIT 1`, [partySlug]);
      if (!exists.rows[0]) break;
      partySlug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const created = await client.query(
      `INSERT INTO watch_party (
         media_type,
         tmdb_id,
         media_title,
         party_name,
         party_slug,
         host_user_id,
         jellyfin_item_id,
         max_viewers,
         message_rate_limit_seconds,
         selected_season_number,
         selected_episode_number,
         selected_episode_title,
         selected_jellyfin_item_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        input.mediaType,
        input.tmdbId,
        input.mediaTitle,
        input.partyName,
        partySlug,
        input.hostUserId,
        input.jellyfinItemId ?? null,
        Math.min(Math.max(input.maxViewers ?? 10, 1), 10),
        Math.min(Math.max(input.messageRateLimitSeconds ?? 15, 1), 120),
        input.selectedSeasonNumber ?? null,
        input.selectedEpisodeNumber ?? null,
        input.selectedEpisodeTitle ?? null,
        input.selectedJellyfinItemId ?? null,
      ]
    );
    const partyId = String(created.rows[0].id);

    await client.query(
      `INSERT INTO watch_party_participant (
         party_id, user_id, role, can_invite, can_pause, can_moderate_chat, chat_muted, chat_color
       ) VALUES ($1, $2, 'host', TRUE, TRUE, TRUE, FALSE, '#60A5FA')`,
      [partyId, input.hostUserId]
    );

    await client.query("COMMIT");

    const party = await getWatchPartyById(partyId);
    if (!party) throw new Error("Failed to create watch party");
    return party;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getWatchPartyById(partyId: string): Promise<WatchPartySummary | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT ${BASE_SELECT}
     FROM watch_party wp
     JOIN app_user host ON host.id = wp.host_user_id
     LEFT JOIN (
       SELECT party_id, COUNT(*)::int AS viewer_count
       FROM watch_party_participant
       GROUP BY party_id
     ) vc ON vc.party_id = wp.id
     WHERE wp.id = $1
     LIMIT 1`,
    [partyId]
  );
  return res.rows[0] ?? null;
}

export async function getWatchPartyBySlug(slug: string): Promise<WatchPartySummary | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT ${BASE_SELECT}
     FROM watch_party wp
     JOIN app_user host ON host.id = wp.host_user_id
     LEFT JOIN (
       SELECT party_id, COUNT(*)::int AS viewer_count
       FROM watch_party_participant
       GROUP BY party_id
     ) vc ON vc.party_id = wp.id
     WHERE wp.party_slug = $1
     LIMIT 1`,
    [slug.toLowerCase()]
  );
  return res.rows[0] ?? null;
}

export async function resolveWatchPartyId(identifier: string): Promise<string | null> {
  const value = String(identifier || "").trim();
  if (!value) return null;
  if (isUuid(value)) return value;
  const party = await getWatchPartyBySlug(value);
  return party?.id ?? null;
}

export async function getWatchPartyParticipant(partyId: string, userId: number): Promise<WatchPartyParticipant | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       wpp.party_id as "partyId",
       wpp.user_id as "userId",
       au.username,
       au.display_name as "displayName",
      au.avatar_url as "avatarUrl",
       wpp.role,
       wpp.can_invite as "canInvite",
       wpp.can_pause as "canPause",
       wpp.can_moderate_chat as "canModerateChat",
       wpp.chat_muted as "chatMuted",
      wpp.chat_color as "chatColor",
       wpp.last_seen_at as "lastSeenAt",
       wpp.warn_count as "warnCount",
       wpp.joined_at as "joinedAt"
     FROM watch_party_participant wpp
     JOIN app_user au ON au.id = wpp.user_id
     WHERE wpp.party_id = $1 AND wpp.user_id = $2
     LIMIT 1`,
    [partyId, userId]
  );
  return res.rows[0] ?? null;
}

export async function listWatchPartyParticipants(partyId: string): Promise<WatchPartyParticipant[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       wpp.party_id as "partyId",
       wpp.user_id as "userId",
       au.username,
       au.display_name as "displayName",
      au.avatar_url as "avatarUrl",
       wpp.role,
       wpp.can_invite as "canInvite",
       wpp.can_pause as "canPause",
       wpp.can_moderate_chat as "canModerateChat",
       wpp.chat_muted as "chatMuted",
      wpp.chat_color as "chatColor",
       wpp.last_seen_at as "lastSeenAt",
       wpp.warn_count as "warnCount",
       wpp.joined_at as "joinedAt"
     FROM watch_party_participant wpp
     JOIN app_user au ON au.id = wpp.user_id
     WHERE wpp.party_id = $1
     ORDER BY wpp.role DESC, wpp.joined_at ASC`,
    [partyId]
  );
  return res.rows;
}

export async function renameWatchParty(partyId: string, hostUserId: number, partyName: string): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE watch_party
     SET party_name = $3
     WHERE id = $1 AND host_user_id = $2`,
    [partyId, hostUserId, partyName]
  );
  return Number(res.rowCount ?? 0) > 0;
}

export async function isActiveWatchPartyNameTaken(partyName: string, excludePartyId?: string) {
  const p = getPool();
  const values: unknown[] = [partyName.trim().toLowerCase()];
  let query = `SELECT 1
               FROM watch_party
               WHERE lower(party_name) = $1 AND status = 'active'`;

  if (excludePartyId) {
    values.push(excludePartyId);
    query += ` AND id <> $2`;
  }

  query += ` LIMIT 1`;
  const res = await p.query(query, values);
  return Boolean(res.rows[0]);
}

export async function endWatchParty(partyId: string, hostUserId: number): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE watch_party
     SET status = 'ended', ended_at = NOW()
     WHERE id = $1 AND host_user_id = $2 AND status = 'active'`,
    [partyId, hostUserId]
  );
  const ended = Number(res.rowCount ?? 0) > 0;
  if (ended) {
    // Revoke pending invites — they are only valid for active parties
    await p.query(
      `DELETE FROM watch_party_invite WHERE party_id = $1 AND status = 'pending'`,
      [partyId]
    ).catch(() => {});
  }
  return ended;
}

export async function leaveWatchParty(
  partyId: string,
  userId: number
): Promise<{ left: boolean; deletedParty: boolean }> {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");

    const membership = await client.query(
      `SELECT role
       FROM watch_party_participant
       WHERE party_id = $1 AND user_id = $2
       LIMIT 1
       FOR UPDATE`,
      [partyId, userId]
    );

    if (!membership.rows[0]) {
      await client.query("ROLLBACK");
      return { left: false, deletedParty: false };
    }

    const isHost = String(membership.rows[0].role) === "host";

    if (isHost) {
      // Delete invites first (safety — explicit before party row delete)
      await client.query(
        `DELETE FROM watch_party_invite WHERE party_id = $1`,
        [partyId]
      );
      const deleted = await client.query(
        `DELETE FROM watch_party
         WHERE id = $1 AND host_user_id = $2`,
        [partyId, userId]
      );
      await client.query("COMMIT");
      return {
        left: Number(deleted.rowCount ?? 0) > 0,
        deletedParty: Number(deleted.rowCount ?? 0) > 0,
      };
    }

    const removed = await client.query(
      `DELETE FROM watch_party_participant
       WHERE party_id = $1 AND user_id = $2`,
      [partyId, userId]
    );

    await client.query("COMMIT");
    return { left: Number(removed.rowCount ?? 0) > 0, deletedParty: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateWatchPartySettings(input: {
  partyId: string;
  hostUserId: number;
  chatModerationEnabled?: boolean;
  blockedLanguageFilterEnabled?: boolean;
  messageRateLimitSeconds?: number;
  selectedSeasonNumber?: number | null;
  selectedEpisodeNumber?: number | null;
  selectedEpisodeTitle?: string | null;
  selectedJellyfinItemId?: string | null;
  theme?: string;
}): Promise<boolean> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (input.chatModerationEnabled !== undefined) {
    sets.push(`chat_moderation_enabled = $${index++}`);
    values.push(Boolean(input.chatModerationEnabled));
  }

  if (input.blockedLanguageFilterEnabled !== undefined) {
    sets.push(`blocked_language_filter_enabled = $${index++}`);
    values.push(Boolean(input.blockedLanguageFilterEnabled));
  }

  if (input.messageRateLimitSeconds !== undefined) {
    sets.push(`message_rate_limit_seconds = $${index++}`);
    values.push(Math.min(Math.max(Math.floor(input.messageRateLimitSeconds), 1), 120));
  }

  if (input.selectedSeasonNumber !== undefined) {
    sets.push(`selected_season_number = $${index++}`);
    values.push(input.selectedSeasonNumber);
  }

  if (input.selectedEpisodeNumber !== undefined) {
    sets.push(`selected_episode_number = $${index++}`);
    values.push(input.selectedEpisodeNumber);
  }

  if (input.selectedEpisodeTitle !== undefined) {
    sets.push(`selected_episode_title = $${index++}`);
    values.push(input.selectedEpisodeTitle);
  }

  if (input.selectedJellyfinItemId !== undefined) {
    sets.push(`selected_jellyfin_item_id = $${index++}`);
    values.push(input.selectedJellyfinItemId);
  }

  const VALID_THEMES = ["void", "midnight", "ember", "forest", "aurora", "rose", "gold",
                        "blood", "crypt", "neon", "wasteland", "inferno", "phantasm"];
  if (input.theme !== undefined && VALID_THEMES.includes(input.theme)) {
    sets.push(`theme = $${index++}`);
    values.push(input.theme);
  }

  if (sets.length === 0) {
    return false;
  }

  values.push(input.partyId, input.hostUserId);

  const p = getPool();
  const res = await p.query(
    `UPDATE watch_party
     SET ${sets.join(", ")}
     WHERE id = $${index++} AND host_user_id = $${index}`,
    values
  );

  return Number(res.rowCount ?? 0) > 0;
}

export async function createOrRefreshInvite(input: {
  partyId: string;
  userId: number;
  invitedByUserId: number;
  canInvite?: boolean;
  canPause?: boolean;
  canModerateChat?: boolean;
  chatMuted?: boolean;
  message?: string | null;
}): Promise<WatchPartyInvite> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO watch_party_invite (
       party_id, user_id, invited_by_user_id, status, can_invite, can_pause, can_moderate_chat, chat_muted, message
     ) VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8)
     ON CONFLICT DO NOTHING
     RETURNING
       id,
       party_id as "partyId",
       user_id as "userId",
       invited_by_user_id as "invitedByUserId",
       status,
       can_invite as "canInvite",
       can_pause as "canPause",
       can_moderate_chat as "canModerateChat",
       chat_muted as "chatMuted",
       message,
       created_at as "createdAt",
       responded_at as "respondedAt"`,
    [
      input.partyId,
      input.userId,
      input.invitedByUserId,
      Boolean(input.canInvite),
      Boolean(input.canPause),
      Boolean(input.canModerateChat),
      Boolean(input.chatMuted),
      input.message ?? null,
    ]
  );

  if (res.rows[0]) return res.rows[0];

  const updated = await p.query(
    `UPDATE watch_party_invite
     SET invited_by_user_id = $3,
         status = 'pending',
         can_invite = $4,
         can_pause = $5,
         can_moderate_chat = $6,
         chat_muted = $7,
         message = $8,
         responded_at = NULL
     WHERE id = (
       SELECT id
       FROM watch_party_invite
       WHERE party_id = $1 AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 1
     )
     RETURNING
       id,
       party_id as "partyId",
       user_id as "userId",
       invited_by_user_id as "invitedByUserId",
       status,
       can_invite as "canInvite",
       can_pause as "canPause",
       can_moderate_chat as "canModerateChat",
       chat_muted as "chatMuted",
       message,
       created_at as "createdAt",
       responded_at as "respondedAt"`,
    [
      input.partyId,
      input.userId,
      input.invitedByUserId,
      Boolean(input.canInvite),
      Boolean(input.canPause),
      Boolean(input.canModerateChat),
      Boolean(input.chatMuted),
      input.message ?? null,
    ]
  );

  return updated.rows[0];
}

export async function getLatestInviteForUser(partyId: string, userId: number): Promise<WatchPartyInvite | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       id,
       party_id as "partyId",
       user_id as "userId",
       invited_by_user_id as "invitedByUserId",
       status,
       can_invite as "canInvite",
       can_pause as "canPause",
       can_moderate_chat as "canModerateChat",
       chat_muted as "chatMuted",
       message,
       created_at as "createdAt",
       responded_at as "respondedAt"
     FROM watch_party_invite
     WHERE party_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [partyId, userId]
  );
  return res.rows[0] ?? null;
}

export async function joinWatchPartyFromInvite(partyId: string, userId: number) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");

    const partyRes = await client.query(
      `SELECT id, max_viewers as "maxViewers", status
       FROM watch_party
       WHERE id = $1
       FOR UPDATE`,
      [partyId]
    );
    const party = partyRes.rows[0];
    if (!party || party.status !== "active") {
      throw new Error("PARTY_NOT_ACTIVE");
    }

    const existingParticipant = await client.query(
      `SELECT 1 FROM watch_party_participant WHERE party_id = $1 AND user_id = $2`,
      [partyId, userId]
    );
    if (existingParticipant.rows.length > 0) {
      await client.query("COMMIT");
      return { joined: true, alreadyJoined: true };
    }

    const inviteRes = await client.query(
      `SELECT id, can_invite as "canInvite", can_pause as "canPause", can_moderate_chat as "canModerateChat", chat_muted as "chatMuted"
       FROM watch_party_invite
       WHERE party_id = $1 AND user_id = $2 AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1
       FOR UPDATE`,
      [partyId, userId]
    );
    const invite = inviteRes.rows[0];
    if (!invite) {
      throw new Error("INVITE_REQUIRED");
    }

    const viewerCount = await client.query(
      `SELECT COUNT(*)::int AS count FROM watch_party_participant WHERE party_id = $1`,
      [partyId]
    );
    const count = Number(viewerCount.rows[0]?.count ?? 0);
    if (count >= Number(party.maxViewers)) {
      throw new Error("PARTY_FULL");
    }

    await client.query(
      `INSERT INTO watch_party_participant (
         party_id, user_id, role, can_invite, can_pause, can_moderate_chat, chat_muted
       ) VALUES ($1, $2, 'member', $3, $4, $5, $6)
       ON CONFLICT DO NOTHING`,
      [partyId, userId, invite.canInvite, invite.canPause, invite.canModerateChat, invite.chatMuted]
    );

    await client.query(
      `UPDATE watch_party_invite
       SET status = 'accepted', responded_at = NOW()
       WHERE id = $1`,
      [invite.id]
    );

    await client.query("COMMIT");
    return { joined: true, alreadyJoined: false };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createJoinRequest(partyId: string, requesterUserId: number): Promise<WatchPartyJoinRequest> {
  const p = getPool();
  const existing = await p.query(
    `SELECT id
     FROM watch_party_join_request
     WHERE party_id = $1 AND requester_user_id = $2 AND status = 'pending'
     LIMIT 1`,
    [partyId, requesterUserId]
  );
  if (existing.rows[0]) {
    const request = await getJoinRequestById(String(existing.rows[0].id));
    if (!request) throw new Error("Failed to load existing join request");
    return request;
  }

  const created = await p.query(
    `INSERT INTO watch_party_join_request (party_id, requester_user_id)
     VALUES ($1, $2)
     RETURNING id`,
    [partyId, requesterUserId]
  );
  const request = await getJoinRequestById(String(created.rows[0].id));
  if (!request) throw new Error("Failed to create join request");
  return request;
}

export async function listPendingJoinRequests(partyId: string): Promise<WatchPartyJoinRequest[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       jr.id,
       jr.party_id as "partyId",
       jr.requester_user_id as "requesterUserId",
       au.username as "requesterUsername",
       au.display_name as "requesterDisplayName",
       jr.status,
       jr.created_at as "createdAt",
       jr.resolved_at as "resolvedAt"
     FROM watch_party_join_request jr
     JOIN app_user au ON au.id = jr.requester_user_id
     WHERE jr.party_id = $1 AND jr.status = 'pending'
     ORDER BY jr.created_at ASC`,
    [partyId]
  );
  return res.rows;
}

export async function getJoinRequestById(joinRequestId: string): Promise<WatchPartyJoinRequest | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       jr.id,
       jr.party_id as "partyId",
       jr.requester_user_id as "requesterUserId",
       au.username as "requesterUsername",
       au.display_name as "requesterDisplayName",
       jr.status,
       jr.created_at as "createdAt",
       jr.resolved_at as "resolvedAt"
     FROM watch_party_join_request jr
     JOIN app_user au ON au.id = jr.requester_user_id
     WHERE jr.id = $1
     LIMIT 1`,
    [joinRequestId]
  );
  return res.rows[0] ?? null;
}

export async function resolveJoinRequest(joinRequestId: string, resolverUserId: number, decision: "approved" | "denied") {
  const p = getPool();
  const res = await p.query(
    `UPDATE watch_party_join_request
     SET status = $3, resolved_by_user_id = $2, resolved_at = NOW()
     WHERE id = $1 AND status = 'pending'
     RETURNING id, party_id as "partyId", requester_user_id as "requesterUserId"`,
    [joinRequestId, resolverUserId, decision]
  );
  return res.rows[0] ?? null;
}

export async function updateParticipantPermissions(input: {
  partyId: string;
  userId: number;
  canInvite?: boolean;
  canPause?: boolean;
  canModerateChat?: boolean;
  chatMuted?: boolean;
  chatColor?: string;
}) {
  const p = getPool();
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (input.canInvite !== undefined) {
    sets.push(`can_invite = $${i++}`);
    values.push(Boolean(input.canInvite));
  }
  if (input.canPause !== undefined) {
    sets.push(`can_pause = $${i++}`);
    values.push(Boolean(input.canPause));
  }
  if (input.canModerateChat !== undefined) {
    sets.push(`can_moderate_chat = $${i++}`);
    values.push(Boolean(input.canModerateChat));
  }
  if (input.chatMuted !== undefined) {
    sets.push(`chat_muted = $${i++}`);
    values.push(Boolean(input.chatMuted));
  }
  if (input.chatColor !== undefined) {
    sets.push(`chat_color = $${i++}`);
    values.push(input.chatColor);
  }

  if (sets.length === 0) return null;

  values.push(input.partyId, input.userId);
  const res = await p.query(
    `UPDATE watch_party_participant
     SET ${sets.join(", ")}
     WHERE party_id = $${i++} AND user_id = $${i}
     RETURNING party_id as "partyId", user_id as "userId", role,
               can_invite as "canInvite", can_pause as "canPause", can_moderate_chat as "canModerateChat", chat_muted as "chatMuted", chat_color as "chatColor", joined_at as "joinedAt"`,
    values
  );
  return res.rows[0] ?? null;
}

export async function getLatestWatchPartyMessageTime(partyId: string, userId: number): Promise<string | null> {
  const p = getPool();
  const res = await p.query(
    `SELECT created_at as "createdAt"
     FROM watch_party_message
     WHERE party_id = $1 AND user_id = $2 AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [partyId, userId]
  );
  return (res.rows[0]?.createdAt as string | undefined) ?? null;
}

export async function listWatchPartyInviteCandidates(
  currentUserId: number,
  query: string,
  limit = 10
): Promise<WatchPartyInviteCandidate[]> {
  const p = getPool();
  const q = `%${query.trim()}%`;
  const res = await p.query(
    `SELECT id, username, display_name as "displayName", avatar_url as "avatarUrl"
     FROM app_user
     WHERE id <> $1
       AND (lower(username) LIKE lower($2) OR lower(display_name) LIKE lower($2))
     ORDER BY username ASC
     LIMIT $3`,
    [currentUserId, q, Math.min(Math.max(limit, 1), 20)]
  );
  return res.rows;
}

export async function createWatchPartyMessage(partyId: string, userId: number, message: string): Promise<WatchPartyMessage> {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO watch_party_message (party_id, user_id, message)
     VALUES ($1, $2, $3)
     RETURNING id, party_id as "partyId", user_id as "userId", message, created_at as "createdAt"`,
    [partyId, userId, message]
  );
  const row = res.rows[0];
  const userRes = await p.query(
    `SELECT username, display_name as "displayName" FROM app_user WHERE id = $1`,
    [userId]
  );
  const participant = await p.query(
    `SELECT chat_color as "chatColor" FROM watch_party_participant WHERE party_id = $1 AND user_id = $2 LIMIT 1`,
    [partyId, userId]
  );
  return {
    ...row,
    username: userRes.rows[0]?.username ?? "unknown",
    displayName: userRes.rows[0]?.displayName ?? null,
    chatColor: participant.rows[0]?.chatColor ?? "#60A5FA",
  };
}

export async function listWatchPartyMessages(partyId: string, limit = 120): Promise<WatchPartyMessage[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       m.id,
       m.party_id as "partyId",
       m.user_id as "userId",
       au.username,
       au.display_name as "displayName",
       wpp.chat_color as "chatColor",
       m.message,
       m.created_at as "createdAt"
     FROM watch_party_message m
     JOIN app_user au ON au.id = m.user_id
     JOIN watch_party_participant wpp ON wpp.party_id = m.party_id AND wpp.user_id = m.user_id
     WHERE m.party_id = $1 AND m.deleted_at IS NULL
     ORDER BY m.created_at DESC
     LIMIT $2`,
    [partyId, Math.min(Math.max(limit, 1), 300)]
  );
  return res.rows.reverse();
}

export async function canUserAccessWatchParty(partyId: string, userId: number): Promise<boolean> {
  const participant = await getWatchPartyParticipant(partyId, userId);
  if (!participant) return false;
  const party = await getWatchPartyById(partyId);
  return Boolean(party);
}

export async function getPartyWithContext(partyId: string, userId: number) {
  const party = await getWatchPartyById(partyId);
  if (!party) return null;

  const participant = await getWatchPartyParticipant(partyId, userId);
  const invite = await getLatestInviteForUser(partyId, userId);

  return {
    party,
    participant,
    invite,
    viewerCount: await getViewerCount(partyId),
  };
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

export async function touchParticipantHeartbeat(partyId: string, userId: number): Promise<void> {
  const p = getPool();
  await p
    .query(
      `UPDATE watch_party_participant SET last_seen_at = NOW() WHERE party_id = $1 AND user_id = $2`,
      [partyId, userId]
    )
    .catch(() => {});
}

// ─── Message delta (cursor-based) ─────────────────────────────────────────────

export async function listWatchPartyMessagesAfter(
  partyId: string,
  afterId: number
): Promise<WatchPartyMessage[]> {
  const p = getPool();
  const res = await p.query(
    `SELECT
       m.id,
       m.party_id as "partyId",
       m.user_id as "userId",
       au.username,
       au.display_name as "displayName",
       wpp.chat_color as "chatColor",
       m.message,
       m.created_at as "createdAt"
     FROM watch_party_message m
     JOIN app_user au ON au.id = m.user_id
     JOIN watch_party_participant wpp ON wpp.party_id = m.party_id AND wpp.user_id = m.user_id
     WHERE m.party_id = $1 AND m.id > $2 AND m.deleted_at IS NULL
     ORDER BY m.id ASC
     LIMIT 100`,
    [partyId, afterId]
  );
  return res.rows;
}

export async function getLatestWatchPartyMessageId(partyId: string): Promise<number> {
  const p = getPool();
  const res = await p.query(
    `SELECT COALESCE(MAX(id), 0) AS "lastId"
     FROM watch_party_message
     WHERE party_id = $1 AND deleted_at IS NULL`,
    [partyId]
  );
  return Number(res.rows[0]?.lastId ?? 0);
}

// ─── Message soft-delete ──────────────────────────────────────────────────────

export async function deleteWatchPartyMessage(
  messageId: number,
  partyId: string
): Promise<boolean> {
  const p = getPool();
  const res = await p.query(
    `UPDATE watch_party_message
     SET deleted_at = NOW()
     WHERE id = $1 AND party_id = $2 AND deleted_at IS NULL`,
    [messageId, partyId]
  );
  return Number(res.rowCount ?? 0) > 0;
}

// ─── Playback sync ────────────────────────────────────────────────────────────

export async function updatePlaybackState(
  partyId: string,
  updatedByUserId: number,
  opts: { isPaused?: boolean; playbackPositionSeconds?: number }
): Promise<boolean> {
  const p = getPool();
  const setClauses: string[] = ["playback_updated_at = NOW()", "playback_updated_by = $2"];
  const params: unknown[] = [partyId, updatedByUserId];
  let idx = 3;

  if (opts.isPaused !== undefined) {
    setClauses.push(`is_paused = $${idx++}`);
    params.push(Boolean(opts.isPaused));
  }
  if (opts.playbackPositionSeconds !== undefined) {
    setClauses.push(`playback_position_seconds = $${idx++}`);
    params.push(Math.max(0, Math.floor(opts.playbackPositionSeconds)));
  }

  const res = await p.query(
    `UPDATE watch_party SET ${setClauses.join(", ")} WHERE id = $1 AND status = 'active'`,
    params
  );
  return Number(res.rowCount ?? 0) > 0;
}

// ─── Tiered chat moderation ──────────────────────────────────────────────────

export async function incrementWarnCountAndMaybeMute(
  partyId: string,
  userId: number
): Promise<{ warnCount: number; muted: boolean }> {
  const p = getPool();
  const res = await p.query(
    `UPDATE watch_party_participant
     SET warn_count = warn_count + 1,
         chat_muted = CASE WHEN warn_count + 1 >= 3 THEN TRUE ELSE chat_muted END
     WHERE party_id = $1 AND user_id = $2
     RETURNING warn_count as "warnCount", chat_muted as "chatMuted"`,
    [partyId, userId]
  );
  const row = res.rows[0];
  if (!row) return { warnCount: 0, muted: false };
  return { warnCount: Number(row.warnCount), muted: Boolean(row.chatMuted) };
}

export async function listAdminWatchParties(limit = 100): Promise<AdminWatchPartyRow[]> {
  const p = getPool();
  const cappedLimit = Math.min(Math.max(Math.floor(limit), 1), 500);
  const res = await p.query(
    `SELECT
       wp.id,
       wp.party_slug as "partySlug",
       wp.party_name as "partyName",
       wp.media_type as "mediaType",
       wp.media_title as "mediaTitle",
       wp.host_user_id as "hostUserId",
       host.username as "hostUsername",
       wp.status,
       wp.created_at as "createdAt",
       wp.updated_at as "updatedAt",
       wp.ended_at as "endedAt",
       COALESCE(wp.theme, 'void') as "theme",
       COALESCE(viewers.viewer_count, 0)::int as "viewerCount",
       COALESCE(msgs.message_count, 0)::int as "messageCount",
       msgs.last_message_at as "lastMessageAt"
     FROM watch_party wp
     JOIN app_user host ON host.id = wp.host_user_id
     LEFT JOIN (
       SELECT party_id, COUNT(*)::int as viewer_count
       FROM watch_party_participant
       GROUP BY party_id
     ) viewers ON viewers.party_id = wp.id
     LEFT JOIN (
       SELECT party_id, COUNT(*)::int as message_count, MAX(created_at) as last_message_at
       FROM watch_party_message
       WHERE deleted_at IS NULL
       GROUP BY party_id
     ) msgs ON msgs.party_id = wp.id
     ORDER BY
       CASE WHEN wp.status = 'active' THEN 0 ELSE 1 END,
       COALESCE(msgs.last_message_at, wp.updated_at) DESC
     LIMIT $1`,
    [cappedLimit]
  );
  return res.rows;
}
