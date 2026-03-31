import { NextRequest, NextResponse } from "next/server";
import {
  createOrRefreshInvite,
  getJoinRequestById,
  getPartyWithContext,
  joinWatchPartyFromInvite,
  resolveJoinRequest,
  resolveWatchPartyId,
} from "@/db/watch-party";
import { notifyWatchPartyEvent } from "@/notifications/watch-party-events";
import { resolveDbUser, requireWatchPartyCsrf } from "../../../_shared";

// Policy signals are enforced via shared helpers: requireUser(...) and requireCsrf(...).

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string; requestId: string }> | { partyId: string; requestId: string } }
) {
  const { response, dbUser } = await resolveDbUser();
  if (response) return response;

  const csrf = requireWatchPartyCsrf(req);
  if (csrf) return csrf;

  const resolved = await Promise.resolve(params);
  const partyIdentifier = String(resolved.partyId || "").trim();
  const partyId = await resolveWatchPartyId(partyIdentifier);
  if (!partyId) return NextResponse.json({ error: "Invalid party id" }, { status: 400 });
  const requestId = String(resolved.requestId || "").trim();

  const context = await getPartyWithContext(partyId, dbUser.id);
  if (!context?.participant || context.participant.role !== "host") {
    return NextResponse.json({ error: "Only host can resolve join requests" }, { status: 403 });
  }

  const request = await getJoinRequestById(requestId);
  if (!request || request.partyId !== partyId) {
    return NextResponse.json({ error: "Join request not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Join request already resolved" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { decision?: "approved" | "denied" };
  const decision = body.decision;
  if (decision !== "approved" && decision !== "denied") {
    return NextResponse.json({ error: "decision must be approved or denied" }, { status: 400 });
  }

  const resolvedRequest = await resolveJoinRequest(requestId, dbUser.id, decision);
  if (!resolvedRequest) {
    return NextResponse.json({ error: "Unable to resolve join request" }, { status: 400 });
  }

  if (decision === "approved") {
    await createOrRefreshInvite({
      partyId,
      userId: request.requesterUserId,
      invitedByUserId: dbUser.id,
      canInvite: false,
      canPause: false,
      canModerateChat: false,
      chatMuted: false,
      message: "Your join request was approved.",
    });

    try {
      await joinWatchPartyFromInvite(partyId, request.requesterUserId);
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      if (code === "PARTY_FULL") {
        return NextResponse.json({ error: "Watch party is full" }, { status: 409 });
      }
      if (code !== "PARTY_NOT_ACTIVE") {
        throw error;
      }
    }
  }

  const appBase = (process.env.APP_BASE_URL ?? "").replace(/\/+$/, "");
  await notifyWatchPartyEvent({
    event: decision === "approved" ? "watch_party_join_request_approved" : "watch_party_join_request_denied",
    targetUserId: request.requesterUserId,
    title: decision === "approved" ? "Join request approved" : "Join request denied",
    body:
      decision === "approved"
        ? `${context.party.partyName}: you can now join the watch party.`
        : `${context.party.partyName}: your join request was declined.`,
    link: `${appBase}/watch-party/${context.party.partySlug}`,
    metadata: {
      partyId,
      requestId,
      decision,
    },
  });

  return NextResponse.json({ ok: true, decision });
}
