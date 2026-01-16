import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/auth";
import { addCalendarSubscription, removeCalendarSubscription, listCalendarSubscriptions } from "@/db";
import { requireCsrf } from "@/lib/csrf";

const SubscribeSchema = z.object({
  eventType: z.enum(["movie_release", "tv_premiere", "tv_episode", "season_premiere"]),
  tmdbId: z.coerce.number().int().positive(),
  seasonNumber: z.coerce.number().int().optional(),
  episodeNumber: z.coerce.number().int().optional(),
});

const UnsubscribeSchema = z.object({
  subscriptionId: z.string().uuid(),
});

/**
 * GET /api/calendar/subscribe - List user's subscriptions
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getUser();
    const subscriptions = await listCalendarSubscriptions(user.id);

    return NextResponse.json({ subscriptions });
  } catch (error) {
    console.error("[Calendar Subscribe] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch subscriptions" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/calendar/subscribe - Subscribe to "notify when available"
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUser();

    // CSRF protection
    const csrfError = requireCsrf(req);
    if (csrfError) return csrfError;

    const body = await req.json();
    const data = SubscribeSchema.parse(body);

    // Check if subscription already exists
    const existingSubscriptions = await listCalendarSubscriptions(user.id);
    const alreadySubscribed = existingSubscriptions.some(
      (sub) =>
        sub.eventType === data.eventType &&
        sub.tmdbId === data.tmdbId &&
        sub.seasonNumber === (data.seasonNumber ?? null) &&
        sub.episodeNumber === (data.episodeNumber ?? null)
    );

    if (alreadySubscribed) {
      return NextResponse.json(
        { error: "Already subscribed to this event" },
        { status: 400 }
      );
    }

    // Create subscription
    await addCalendarSubscription({
      userId: user.id,
      eventType: data.eventType,
      tmdbId: data.tmdbId,
      seasonNumber: data.seasonNumber ?? undefined,
      episodeNumber: data.episodeNumber ?? undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Calendar Subscribe] POST Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create subscription" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/calendar/subscribe - Unsubscribe from notifications
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getUser();

    // CSRF protection
    const csrfError = requireCsrf(req);
    if (csrfError) return csrfError;

    const body = await req.json();
    const data = UnsubscribeSchema.parse(body);

    // Remove subscription
    const removed = await removeCalendarSubscription(data.subscriptionId, user.id);

    if (!removed) {
      return NextResponse.json(
        { error: "Subscription not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Calendar Subscribe] DELETE Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to remove subscription" },
      { status: 500 }
    );
  }
}
