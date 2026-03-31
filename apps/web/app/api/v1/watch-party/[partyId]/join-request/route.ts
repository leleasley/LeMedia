import { NextRequest, NextResponse } from "next/server";
import {
  createJoinRequest,
  getPartyWithContext,
  getWatchPartyParticipant,
  listPendingJoinRequests,
  resolveWatchPartyId,
} from "@/db/watch-party";
import { notifyWatchPartyEvent } from "@/notifications/watch-party-events";
import { resolveDbUser, requireWatchPartyCsrf } from "../../_shared";

// Policy signals are enforced via shared helpers: requireUser(...) and requireCsrf(...).

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> | { partyId: string } }
) {
  const { response, dbUser } = await resolveDbUser();
  if (response) return response;

  const resolved = await Promise.resolve(params);
  const partyIdentifier = String(resolved.partyId || "").trim();
  const partyId = await resolveWatchPartyId(partyIdentifier);
  if (!partyId) return NextResponse.json({ error: "Invalid party id" }, { status: 400 });

  const context = await getPartyWithContext(partyId, dbUser.id);
  if (!context?.participant || context.participant.role !== "host") {
    return NextResponse.json({ error: "Only host can view join requests" }, { status: 403 });
  }

  const requests = await listPendingJoinRequests(partyId);
  return NextResponse.json({ requests });
}

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

  const context = await getPartyWithContext(partyId, dbUser.id);
  if (!context?.party) return NextResponse.json({ error: "Watch party not found" }, { status: 404 });

  if (context.participant) {
    return NextResponse.json({ error: "You are already in this watch party" }, { status: 400 });
  }

  if (context.party.status !== "active") {
    return NextResponse.json({ error: "Watch party is not active" }, { status: 400 });
  }

  const currentMembers = await getWatchPartyParticipant(partyId, dbUser.id);
  if (currentMembers) {
    return NextResponse.json({ error: "You are already in this watch party" }, { status: 400 });
  }

  const request = await createJoinRequest(partyId, dbUser.id);

  const appBase = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  await notifyWatchPartyEvent({
    event: "watch_party_join_request",
    targetUserId: context.party.hostUserId,
    title: `Join request for ${context.party.partyName}`,
    body: `${dbUser.username} requested to join your watch party.`,
    link: `${appBase}/watch-party/${context.party.partySlug}`,
    metadata: {
      partyId,
      requesterUserId: dbUser.id,
    },
  });

  return NextResponse.json({ request }, { status: 201 });
}
