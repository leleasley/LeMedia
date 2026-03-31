import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getPool, getUserByUsernameInsensitive } from "@/db";
import {
  createOrRefreshInvite,
  getPartyWithContext,
  getWatchPartyParticipant,
  resolveWatchPartyId,
} from "@/db/watch-party";
import { notifyWatchPartyEvent } from "@/notifications/watch-party-events";
import { resolveDbUser, requireWatchPartyCsrf } from "../../_shared";

// Policy signals are enforced via shared helpers: requireUser(...) and requireCsrf(...).

const InviteSchema = z.object({
  username: z.string().trim().min(1).max(100).optional(),
  userId: z.number().int().positive().optional(),
  rolePreset: z.enum(["viewer", "co_host_lite", "moderator"]).optional(),
  canInvite: z.boolean().optional().default(false),
  canPause: z.boolean().optional().default(false),
  canModerateChat: z.boolean().optional().default(false),
  chatMuted: z.boolean().optional().default(false),
  message: z.string().trim().max(500).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> | { partyId: string } }
) {
  const { response, dbUser } = await resolveDbUser();
  if (response) return response;

  const csrf = requireWatchPartyCsrf(req);
  if (csrf) return csrf;

  const resolved = await Promise.resolve(params);
  const partyIdentifier = String(resolved.partyId || "").trim();
  const partyId = await resolveWatchPartyId(partyIdentifier);
  if (!partyId) return NextResponse.json({ error: "Invalid party id" }, { status: 400 });

  let body: z.infer<typeof InviteSchema>;
  try {
    body = InviteSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const context = await getPartyWithContext(partyId, dbUser.id);
  if (!context?.party || !context.participant) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const canInvite = context.participant.role === "host" || context.participant.canInvite;
  if (!canInvite) {
    return NextResponse.json({ error: "Only host or permitted members can invite" }, { status: 403 });
  }

  if (context.party.status !== "active") {
    return NextResponse.json({ error: "Watch party is not active" }, { status: 400 });
  }

  let targetUser: { id: number; username: string | null } | null = null;
  if (body.userId) {
    const p = getPool();
    const userRes = await p.query(`SELECT id, username FROM app_user WHERE id = $1 LIMIT 1`, [body.userId]);
    targetUser = userRes.rows[0] ?? null;
  } else if (body.username) {
    targetUser = await getUserByUsernameInsensitive(body.username);
  }

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (targetUser.id === dbUser.id) {
    return NextResponse.json({ error: "You are already in this watch party" }, { status: 400 });
  }

  const existingParticipant = await getWatchPartyParticipant(partyId, targetUser.id);
  if (existingParticipant) {
    return NextResponse.json({ error: "User is already in this watch party" }, { status: 409 });
  }

  const presetPermissions = body.rolePreset
    ? body.rolePreset === "viewer"
      ? { canInvite: false, canPause: false, canModerateChat: false, chatMuted: false }
      : body.rolePreset === "co_host_lite"
        ? { canInvite: false, canPause: true, canModerateChat: false, chatMuted: false }
        : { canInvite: false, canPause: false, canModerateChat: true, chatMuted: false }
    : null;

  const invite = await createOrRefreshInvite({
    partyId,
    userId: targetUser.id,
    invitedByUserId: dbUser.id,
    canInvite: presetPermissions?.canInvite ?? body.canInvite,
    canPause: presetPermissions?.canPause ?? body.canPause,
    canModerateChat: presetPermissions?.canModerateChat ?? body.canModerateChat,
    chatMuted: presetPermissions?.chatMuted ?? body.chatMuted,
    message: body.message ?? null,
  });

  const appBase = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  await notifyWatchPartyEvent({
    event: "watch_party_invite",
    targetUserId: targetUser.id,
    title: `Watch party invite: ${context.party.partyName}`,
    body: `${dbUser.username} invited you to ${context.party.mediaTitle}.`,
    link: `${appBase}/watch-party/${context.party.partySlug}`,
    metadata: {
      partyId,
      mediaType: context.party.mediaType,
      tmdbId: context.party.tmdbId,
    },
  });

  return NextResponse.json({ invite });
}
