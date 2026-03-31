import { NextRequest, NextResponse } from "next/server";
import {
  deleteWatchPartyMessage,
  getPartyWithContext,
  resolveWatchPartyId,
} from "@/db/watch-party";
import { resolveDbUser, requireWatchPartyCsrf } from "../../../_shared";

// Policy signals are enforced via shared helpers: requireUser(...) and requireCsrf(...).

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ partyId: string; messageId: string }> | { partyId: string; messageId: string };
  }
) {
  const { response, dbUser } = await resolveDbUser();
  if (response) return response;

  const csrf = requireWatchPartyCsrf(req);
  if (csrf) return csrf;

  const resolved = await Promise.resolve(params);
  const partyIdentifier = String(resolved.partyId || "").trim();
  const partyId = await resolveWatchPartyId(partyIdentifier);
  if (!partyId) return NextResponse.json({ error: "Watch party not found" }, { status: 404 });

  const messageId = Number.parseInt(String(resolved.messageId || ""), 10);
  if (!Number.isFinite(messageId) || messageId <= 0) {
    return NextResponse.json({ error: "Invalid message id" }, { status: 400 });
  }

  const context = await getPartyWithContext(partyId, dbUser.id);
  if (!context?.participant) {
    return NextResponse.json({ error: "Permission denied" }, { status: 403 });
  }

  const canDelete = context.participant.role === "host" || context.participant.canModerateChat;
  if (!canDelete) {
    return NextResponse.json({ error: "Insufficient privileges to delete messages" }, { status: 403 });
  }

  const deleted = await deleteWatchPartyMessage(messageId, partyId);
  if (!deleted) {
    return NextResponse.json({ error: "Message not found or already deleted" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
