import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  endWatchParty,
  getPartyWithContext,
  isActiveWatchPartyNameTaken,
  leaveWatchParty,
  listPendingJoinRequests,
  listWatchPartyMessages,
  listWatchPartyMessagesAfter,
  listWatchPartyParticipants,
  renameWatchParty,
  resolveWatchPartyId,
  touchParticipantHeartbeat,
  updatePlaybackState,
  updateWatchPartySettings,
} from "@/db/watch-party";
import { notifyWatchPartyEvent } from "@/notifications/watch-party-events";
import { resolveDbUser, requireWatchPartyCsrf } from "../_shared";
import { getJellyfinPlayUrl } from "@/lib/jellyfin-links";

// Policy signals are enforced via shared helpers: requireUser(...) and requireCsrf(...).

const PatchSchema = z.object({
  partyName: z.string().trim().min(1).max(80).optional(),
  action: z.enum(["end", "leave"]).optional(),
  chatModerationEnabled: z.boolean().optional(),
  blockedLanguageFilterEnabled: z.boolean().optional(),
  messageRateLimitSeconds: z.number().int().min(1).max(120).optional(),
  selectedSeasonNumber: z.number().int().min(1).optional().nullable(),
  selectedEpisodeNumber: z.number().int().min(1).optional().nullable(),
  selectedEpisodeTitle: z.string().trim().max(200).optional().nullable(),
  selectedJellyfinItemId: z.string().trim().max(200).optional().nullable(),
  isPaused: z.boolean().optional(),
  playbackPositionSeconds: z.number().int().min(0).max(86400).optional(),
  theme: z.enum(["void", "midnight", "ember", "forest", "aurora", "rose", "gold",
                  "blood", "crypt", "neon", "wasteland", "inferno", "phantasm"]).optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> | { partyId: string } }
) {
  const { response, dbUser } = await resolveDbUser();
  if (response) return response;

  const resolved = await Promise.resolve(params);
  const partyIdentifier = String(resolved.partyId || "").trim();
  const partyId = await resolveWatchPartyId(partyIdentifier);
  if (!partyId) return NextResponse.json({ error: "Watch party not found" }, { status: 404 });

  const context = await getPartyWithContext(partyId, dbUser.id);
  if (!context?.party) return NextResponse.json({ error: "Watch party not found" }, { status: 404 });

  if (!context.participant) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  // Touch presence heartbeat (fire-and-forget)
  void touchParticipantHeartbeat(partyId, dbUser.id);

  const participants = await listWatchPartyParticipants(partyId);
  const afterIdRaw = _req.nextUrl.searchParams.get("after");
  const afterId = afterIdRaw ? Number.parseInt(afterIdRaw, 10) : 0;
  const messages = Number.isFinite(afterId) && afterId > 0
    ? await listWatchPartyMessagesAfter(partyId, afterId)
    : await listWatchPartyMessages(partyId, 150);
  const joinRequests = context.participant.role === "host" ? await listPendingJoinRequests(partyId) : [];
  const playbackItemId = context.party.selectedJellyfinItemId || context.party.jellyfinItemId;
  const playUrl = await getJellyfinPlayUrl(playbackItemId, context.party.mediaType);

  return NextResponse.json({
    party: {
      ...context.party,
      viewerCount: participants.length,
      playUrl,
    },
    me: context.participant,
    participants,
    messages,
    joinRequests,
  });
}

export async function PATCH(
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
  if (!partyId) return NextResponse.json({ error: "Watch party not found" }, { status: 404 });

  let body: z.infer<typeof PatchSchema>;
  try {
    body = PatchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (body.action === "end") {
    const context = await getPartyWithContext(partyId, dbUser.id);
    const ended = await endWatchParty(partyId, dbUser.id);
    if (!ended) return NextResponse.json({ error: "Only host can end this watch party" }, { status: 403 });

    if (context?.party) {
      const appBase = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
      const participants = await listWatchPartyParticipants(partyId);
      await Promise.all(
        participants.map((participant) =>
          notifyWatchPartyEvent({
            event: "watch_party_ended",
            targetUserId: participant.userId,
            title: `Watch party ended: ${context.party.partyName}`,
            body: `${dbUser.username} ended the watch party for ${context.party.mediaTitle}.`,
            link: `${appBase}/watch-party/${context.party.partySlug}`,
            metadata: { partyId, hostUserId: dbUser.id },
          })
        )
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (body.action === "leave") {
    const result = await leaveWatchParty(partyId, dbUser.id);
    if (!result.left) {
      return NextResponse.json({ error: "You are not a participant in this watch party" }, { status: 403 });
    }
    return NextResponse.json({ ok: true, deletedParty: result.deletedParty });
  }

  if (body.partyName) {
    const taken = await isActiveWatchPartyNameTaken(body.partyName, partyId);
    if (taken) {
      return NextResponse.json(
        { error: "WATCH_PARTY_NAME_TAKEN", message: "That party name is already being used by an active watch party." },
        { status: 409 }
      );
    }

    const renamed = await renameWatchParty(partyId, dbUser.id, body.partyName);
    if (!renamed) return NextResponse.json({ error: "Only host can rename this watch party" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  if (
    body.isPaused !== undefined ||
    body.playbackPositionSeconds !== undefined
  ) {
    const context = await getPartyWithContext(partyId, dbUser.id);
    if (!context?.party) return NextResponse.json({ error: "Watch party not found" }, { status: 404 });
    if (!context.participant) return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    const canControl = context.participant.role === "host" || context.participant.canPause;
    if (!canControl) {
      return NextResponse.json({ error: "Only host or permitted members can control playback" }, { status: 403 });
    }
    const updated = await updatePlaybackState(partyId, dbUser.id, {
      isPaused: body.isPaused,
      playbackPositionSeconds: body.playbackPositionSeconds,
    });
    if (!updated) return NextResponse.json({ error: "Unable to update playback state" }, { status: 400 });

    if (body.isPaused !== undefined && body.isPaused !== context.party.isPaused) {
      const appBase = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
      const participants = await listWatchPartyParticipants(partyId);
      await Promise.all(
        participants
          .filter((participant) => participant.userId !== dbUser.id)
          .map((participant) =>
            notifyWatchPartyEvent({
              event: body.isPaused ? "watch_party_paused" : "watch_party_resumed",
              targetUserId: participant.userId,
              title: body.isPaused
                ? `Playback paused: ${context.party.partyName}`
                : `Playback resumed: ${context.party.partyName}`,
              body: `${dbUser.username} ${body.isPaused ? "paused" : "resumed"} playback for everyone.`,
              link: `${appBase}/watch-party/${context.party.partySlug}`,
              metadata: { partyId, actorUserId: dbUser.id, isPaused: body.isPaused },
            })
          )
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (
    body.chatModerationEnabled !== undefined ||
    body.blockedLanguageFilterEnabled !== undefined ||
    body.messageRateLimitSeconds !== undefined ||
    body.selectedSeasonNumber !== undefined ||
    body.selectedEpisodeNumber !== undefined ||
    body.selectedEpisodeTitle !== undefined ||
    body.selectedJellyfinItemId !== undefined ||
    body.theme !== undefined
  ) {
    const updated = await updateWatchPartySettings({
      partyId,
      hostUserId: dbUser.id,
      chatModerationEnabled: body.chatModerationEnabled,
      blockedLanguageFilterEnabled: body.blockedLanguageFilterEnabled,
      messageRateLimitSeconds: body.messageRateLimitSeconds,
      selectedSeasonNumber: body.selectedSeasonNumber,
      selectedEpisodeNumber: body.selectedEpisodeNumber,
      selectedEpisodeTitle: body.selectedEpisodeTitle,
      selectedJellyfinItemId: body.selectedJellyfinItemId,
      theme: body.theme,
    });
    if (!updated) {
      return NextResponse.json({ error: "Only host can change moderation settings" }, { status: 403 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "No changes requested" }, { status: 400 });
}
