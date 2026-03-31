import { NextRequest, NextResponse } from "next/server";
import {
  getWatchPartyParticipant,
  getPartyWithContext,
  resolveWatchPartyId,
  updateParticipantPermissions,
} from "@/db/watch-party";
import { resolveDbUser, requireWatchPartyCsrf } from "../../../_shared";

// Policy signals are enforced via shared helpers: requireUser(...) and requireCsrf(...).

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string; userId: string }> | { partyId: string; userId: string } }
) {
  const { response, dbUser } = await resolveDbUser();
  if (response) return response;

  const csrf = requireWatchPartyCsrf(req);
  if (csrf) return csrf;

  const resolved = await Promise.resolve(params);
  const partyIdentifier = String(resolved.partyId || "").trim();
  const partyId = await resolveWatchPartyId(partyIdentifier);
  if (!partyId) return NextResponse.json({ error: "Invalid party id" }, { status: 400 });
  const targetUserId = Number.parseInt(String(resolved.userId || ""), 10);
  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    canInvite?: boolean;
    canPause?: boolean;
    canModerateChat?: boolean;
    chatMuted?: boolean;
    chatColor?: string;
  };

  const me = await getPartyWithContext(partyId, dbUser.id);
  if (!me?.participant) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const isSelfColorUpdate =
    dbUser.id === targetUserId &&
    bodyOnlyHasChatColor(body);

  if (!isSelfColorUpdate && me.participant.role !== "host" && !me.participant.canModerateChat) {
    return NextResponse.json({ error: "Insufficient privileges" }, { status: 403 });
  }

  const target = await getWatchPartyParticipant(partyId, targetUserId);
  if (!target) {
    return NextResponse.json({ error: "Participant not found" }, { status: 404 });
  }

  if (target.role === "host" && targetUserId !== dbUser.id) {
    return NextResponse.json({ error: "Host permissions cannot be changed" }, { status: 400 });
  }

  if (
    body.canInvite === undefined &&
    body.canPause === undefined &&
    body.canModerateChat === undefined &&
    body.chatMuted === undefined &&
    body.chatColor === undefined
  ) {
    return NextResponse.json(
      { error: "Provide at least one field: canInvite, canPause, canModerateChat, chatMuted, chatColor" },
      { status: 400 }
    );
  }

  if (body.chatColor !== undefined && !/^#[0-9a-fA-F]{6}$/.test(body.chatColor)) {
    return NextResponse.json({ error: "chatColor must be a hex color like #60A5FA" }, { status: 400 });
  }

  const updated = await updateParticipantPermissions({
    partyId,
    userId: targetUserId,
    canInvite: body.canInvite,
    canPause: body.canPause,
    canModerateChat: body.canModerateChat,
    chatMuted: body.chatMuted,
    chatColor: body.chatColor,
  });

  if (!updated) {
    return NextResponse.json({ error: "Unable to update participant" }, { status: 400 });
  }

  return NextResponse.json({ participant: updated });
}

function bodyOnlyHasChatColor(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const keys = Object.keys(body as Record<string, unknown>);
  return keys.length === 1 && keys[0] === "chatColor";
}
