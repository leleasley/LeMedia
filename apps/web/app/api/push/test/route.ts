import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { getUserPushSubscriptions, upsertUser, deletePushSubscription } from "@/db";
import { requireCsrf } from "@/lib/csrf";
import webpush from "web-push";

// Only available in production with proper VAPID keys
export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const csrf = requireCsrf(req);
  if (csrf) return csrf;

  const dbUser = await upsertUser(user.username, user.groups);
  const subscriptions = await getUserPushSubscriptions(dbUser.id);

  if (subscriptions.length === 0) {
    return NextResponse.json(
      { error: "No push subscriptions found. Please enable notifications in settings." },
      { status: 400 }
    );
  }

  const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateVapidKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicVapidKey || !privateVapidKey) {
    return NextResponse.json(
      { error: "VAPID keys not configured" },
      { status: 500 }
    );
  }

  webpush.setVapidDetails(
    "mailto:admin@lemedia.local",
    publicVapidKey,
    privateVapidKey
  );

  const notificationPayload = {
    title: "🎬 Test Notification",
    body: "This is a test notification from LeMedia!",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "test-notification",
    data: {
      url: "/",
      type: "test",
    },
    actions: [
      { action: "open", title: "Open App" },
      { action: "close", title: "Dismiss" },
    ],
    requireInteraction: false,
    vibrate: [200, 100, 200],
  };

  const results = await Promise.allSettled(
    subscriptions.map((sub) => {
      // Log endpoint type for debugging
      console.log("[Push Test] Sending to:", sub.endpoint.substring(0, 50) + "...");

      return webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: sub.keys,
        },
        JSON.stringify(notificationPayload)
      );
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  // Clean up stale subscriptions (410 = Gone, 404 = Not Found)
  const staleSubscriptions = results
    .map((r, idx) => ({ r, idx, sub: subscriptions[idx] }))
    .filter((x) => {
      if (x.r.status !== "rejected") return false;
      const reason = (x.r as PromiseRejectedResult).reason;
      const statusCode = reason?.statusCode;
      return statusCode === 410 || statusCode === 404;
    });

  // Delete stale subscriptions from database
  for (const { sub } of staleSubscriptions) {
    try {
      await deletePushSubscription(dbUser.id, sub.endpoint);
      console.log("[Push Test] Deleted stale subscription:", sub.endpoint.substring(0, 50) + "...");
    } catch (err) {
      console.error("[Push Test] Failed to delete stale subscription:", err);
    }
  }

  const errors = results
    .map((r, idx) => ({ r, idx, sub: subscriptions[idx] }))
    .filter((x) => x.r.status === "rejected")
    .map((x) => {
      const reason = (x.r as PromiseRejectedResult).reason;
      const message =
        reason?.body ||
        reason?.message ||
        reason?.toString?.() ||
        "Unknown error";
      const statusCode = reason?.statusCode;

      console.error("[Push Test] Error:", { statusCode, message });

      return {
        endpoint: x.sub.endpoint,
        statusCode,
        message: typeof message === "string" ? message.slice(0, 200) : "Unknown error",
        isAppleEndpoint: x.sub.endpoint.includes("apple.com"),
        wasDeleted: statusCode === 410 || statusCode === 404,
      };
    });

  const deletedCount = staleSubscriptions.length;
  let message = `Test notification sent! (${succeeded} succeeded, ${failed} failed)`;
  if (deletedCount > 0) {
    message += `. Cleaned up ${deletedCount} expired subscription(s).`;
  }

  return NextResponse.json({
    ok: true,
    message,
    stats: { succeeded, failed, total: subscriptions.length, deletedStale: deletedCount },
    errors,
    note: failed > 0 ? "Some subscriptions may have expired. Try re-enabling notifications on your device." : undefined,
  });
}

export async function GET(req: NextRequest) {
  // GET endpoint to show test notification status/info
  const user = await requireUser();
  if (user instanceof NextResponse) return user;

  const dbUser = await upsertUser(user.username, user.groups);
  const subscriptions = await getUserPushSubscriptions(dbUser.id);

  return NextResponse.json({
    message: "Test notification endpoint",
    instructions: [
      "1. Enable notifications in your app settings (click the bell icon)",
      "2. Choose your device and approve the notification permission",
      "3. Send a test notification by making a POST request to this endpoint",
      "4. You should see a notification on your device",
    ],
    subscriptions_count: subscriptions.length,
    is_configured:
      !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      !!process.env.VAPID_PRIVATE_KEY,
  });
}
