import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  countActivePartiesForVod,
  createWatchParty,
  isActiveWatchPartyNameTaken,
  listActivePartiesForVod,
  type WatchPartyMediaType,
} from "@/db/watch-party";
import { resolveDbUser, requireWatchPartyCsrf } from "./_shared";
import { findAvailableMovieByTmdb, findAvailableSeriesByIds } from "@/lib/jellyfin";
import { getJellyfinItemId } from "@/lib/jellyfin";

// Policy signals are enforced via shared helpers: requireUser(...) and requireCsrf(...).

const CreateSchema = z.object({
  mediaType: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().positive(),
  mediaTitle: z.string().trim().min(1).max(300),
  partyName: z.string().trim().min(1).max(80).optional(),
  forceCreate: z.boolean().optional().default(false),
  jellyfinItemId: z.string().optional(),
});

async function resolveAvailability(mediaType: WatchPartyMediaType, tmdbId: number, mediaTitle: string) {
  if (mediaType === "movie") {
    const found = await findAvailableMovieByTmdb(mediaTitle, tmdbId);
    if (!found.available) return { available: false, jellyfinItemId: null as string | null };
    return { available: true, jellyfinItemId: found.itemId ?? null };
  }

  const found = await findAvailableSeriesByIds(mediaTitle, tmdbId);
  if (!found.available) return { available: false, jellyfinItemId: null as string | null };
  return { available: true, jellyfinItemId: found.itemId ?? null };
}

export async function GET(req: NextRequest) {
  const { response } = await resolveDbUser();
  if (response) return response;

  const mediaType = req.nextUrl.searchParams.get("mediaType");
  const tmdbIdRaw = req.nextUrl.searchParams.get("tmdbId");

  if (!mediaType || !tmdbIdRaw || !/^[0-9]+$/.test(tmdbIdRaw) || (mediaType !== "movie" && mediaType !== "tv")) {
    return NextResponse.json({ error: "mediaType and tmdbId are required" }, { status: 400 });
  }

  const parties = await listActivePartiesForVod(mediaType, Number(tmdbIdRaw));
  return NextResponse.json({ parties, count: parties.length, maxPerVod: 3 });
}

export async function POST(req: NextRequest) {
  const { response, dbUser } = await resolveDbUser();
  if (response) return response;

  const csrf = requireWatchPartyCsrf(req);
  if (csrf) return csrf;

  let body: z.infer<typeof CreateSchema>;
  try {
    body = CreateSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const activeCount = await countActivePartiesForVod(body.mediaType, body.tmdbId);
  const existingParties = await listActivePartiesForVod(body.mediaType, body.tmdbId);
  const desiredName = body.partyName?.trim() || `${body.mediaTitle} Party`;

  const nameTaken = await isActiveWatchPartyNameTaken(desiredName);
  if (nameTaken) {
    return NextResponse.json(
      {
        error: "WATCH_PARTY_NAME_TAKEN",
        message: "That party name is already being used by an active watch party. Pick a different name.",
      },
      { status: 409 }
    );
  }

  const canCreateAnother = activeCount < 3;
  if (activeCount > 0 && !body.forceCreate) {
    return NextResponse.json(
      {
        error: "WATCH_PARTY_EXISTS",
        message: "There is already a watch party for this title.",
        existingParties,
        canCreateAnother,
      },
      { status: 409 }
    );
  }

  if (!canCreateAnother) {
    return NextResponse.json(
      {
        error: "WATCH_PARTY_LIMIT_REACHED",
        message: "Maximum watch parties reached for this title.",
        existingParties,
      },
      { status: 409 }
    );
  }

  // Use the item ID supplied by the frontend (extracted from its playUrl) when available.
  // Fall back to a Jellyfin lookup only when the frontend didn't supply one.
  let jellyfinItemId: string | null = body.jellyfinItemId ?? null;
  if (!jellyfinItemId) {
    const availability = await resolveAvailability(body.mediaType, body.tmdbId, body.mediaTitle);
    if (availability.available) {
      jellyfinItemId = availability.jellyfinItemId ?? (await getJellyfinItemId(body.mediaType, body.tmdbId, body.mediaTitle, null));
    } else {
      // Best-effort fallback — don't block party creation; room will show no playback URL.
      jellyfinItemId = await getJellyfinItemId(body.mediaType, body.tmdbId, body.mediaTitle, null).catch(() => null);
    }
  }

  const party = await createWatchParty({
    mediaType: body.mediaType,
    tmdbId: body.tmdbId,
    mediaTitle: body.mediaTitle,
    partyName: desiredName,
    hostUserId: dbUser.id,
    jellyfinItemId,
    maxViewers: 10,
    messageRateLimitSeconds: 15,
  });

  return NextResponse.json({ party }, { status: 201 });
}
