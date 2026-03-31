import { NextRequest, NextResponse } from "next/server";
import {
  getPartyWithContext,
  joinWatchPartyFromInvite,
  listWatchPartyParticipants,
  resolveWatchPartyId,
} from "@/db/watch-party";
import { notifyWatchPartyEvent } from "@/notifications/watch-party-events";
import { resolveDbUser, requireWatchPartyCsrf } from "../../_shared";

// Policy signals are enforced via shared helpers: requireUser(...) and requireCsrf(...).

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

  try {
    const joined = await joinWatchPartyFromInvite(partyId, dbUser.id);
    const context = await getPartyWithContext(partyId, dbUser.id);

    if (joined.joined && !joined.alreadyJoined && context?.party) {
      const appBase = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");

      await notifyWatchPartyEvent({
        event: "watch_party_invite_accepted",
        targetUserId: context.party.hostUserId,
        title: `${dbUser.username} joined your watch party`,
        body: `${context.party.partyName}: invite accepted for ${context.party.mediaTitle}.`,
        link: `${appBase}/watch-party/${context.party.partySlug}`,
        metadata: { partyId, joinedUserId: dbUser.id },
      });

      const participants = await listWatchPartyParticipants(partyId);
      if (participants.length === 2) {
        await Promise.all(
          participants.map((participant) =>
            notifyWatchPartyEvent({
              event: "watch_party_started",
              targetUserId: participant.userId,
              title: `Watch party started: ${context.party.partyName}`,
              body: `${context.party.mediaTitle} now has enough viewers to start playback.`,
              link: `${appBase}/watch-party/${context.party.partySlug}`,
              metadata: { partyId, viewerCount: participants.length },
            })
          )
        );
      }
    }

    return NextResponse.json({ joined, party: context?.party ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to join watch party";
    if (message === "INVITE_REQUIRED") {
      return NextResponse.json({ error: "Invite required" }, { status: 403 });
    }
    if (message === "PARTY_FULL") {
      return NextResponse.json({ error: "Watch party is full" }, { status: 409 });
    }
    if (message === "PARTY_NOT_ACTIVE") {
      return NextResponse.json({ error: "Watch party is not active" }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to join watch party" }, { status: 500 });
  }
}
