import { NextRequest, NextResponse } from "next/server";
import {
  createWatchPartyMessage,
  getLatestWatchPartyMessageTime,
  getPartyWithContext,
  incrementWarnCountAndMaybeMute,
  listWatchPartyMessages,
  resolveWatchPartyId,
} from "@/db/watch-party";
import { resolveDbUser, requireWatchPartyCsrf } from "../../_shared";
import { containsBlockedWatchPartyLanguage } from "@/lib/watch-party-chat-moderation";

// Policy signals are enforced via shared helpers: requireUser(...) and requireCsrf(...).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ partyId: string }> | { partyId: string } }
) {
  const { response, dbUser } = await resolveDbUser();
  if (response) return response;

  const resolved = await Promise.resolve(params);
  const partyIdentifier = String(resolved.partyId || "").trim();
  const partyId = await resolveWatchPartyId(partyIdentifier);
  if (!partyId) return NextResponse.json({ error: "Invalid party id" }, { status: 400 });

  const context = await getPartyWithContext(partyId, dbUser.id);
  if (!context?.participant) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 120;

  const messages = await listWatchPartyMessages(partyId, Number.isFinite(limit) ? limit : 120);
  return NextResponse.json({ messages });
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
  if (!context?.participant) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  if (context.participant.chatMuted) {
    return NextResponse.json({ error: "You are muted in this watch party" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = String(body.message ?? "").trim();

  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  if (message.length > 2000) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }

  const rateSeconds = Math.min(Math.max(Number(context.party.messageRateLimitSeconds || 15), 1), 120);
  const lastCreatedAt = await getLatestWatchPartyMessageTime(partyId, dbUser.id);
  if (lastCreatedAt) {
    const diffMs = Date.now() - new Date(lastCreatedAt).getTime();
    const waitMs = rateSeconds * 1000 - diffMs;
    if (waitMs > 0) {
      return NextResponse.json(
        {
          error: `Please wait before sending another message (${Math.ceil(waitMs / 1000)}s).`,
          retryAfterSeconds: Math.ceil(waitMs / 1000),
        },
        { status: 429 }
      );
    }
  }

  if (
    context.party.chatModerationEnabled &&
    context.party.blockedLanguageFilterEnabled &&
    containsBlockedWatchPartyLanguage(message)
  ) {
    const { warnCount, muted } = await incrementWarnCountAndMaybeMute(partyId, dbUser.id);
    if (muted) {
      return NextResponse.json(
        { error: "You have been automatically muted for repeated violations." },
        { status: 403 }
      );
    }
    const remaining = 3 - warnCount;
    return NextResponse.json(
      {
        error: `Message blocked by chat filter. ${remaining > 0 ? `${remaining} warning${remaining === 1 ? "" : "s"} remaining before you are muted.` : "Next violation will mute you."}`,
        warnCount,
      },
      { status: 400 }
    );
  }

  const created = await createWatchPartyMessage(partyId, dbUser.id, message);
  return NextResponse.json({ message: created }, { status: 201 });
}
