import "server-only";
import { getUserPushSubscriptions, updatePushSubscriptionLastUsed, deletePushSubscription } from "@/db";
import { sendPushNotification, configureWebPush } from "@/lib/web-push";
import { logger } from "@/lib/logger";

// Configure web push on module load
configureWebPush();

export async function notifyUserPushEvent(
  userId: number,
  event: {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    tag?: string;
  }
) {
  try {
    const subscriptions = await getUserPushSubscriptions(userId);

    if (!subscriptions.length) {
      return;
    }

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const result = await sendPushNotification(sub, event);

        // Delete stale subscriptions
        if (result.shouldDelete) {
          try {
            await deletePushSubscription(userId, sub.endpoint);
            logger.info(`[WebPush] Deleted stale subscription for user ${userId}`);
          } catch (deleteErr) {
            logger.error("[WebPush] Failed to delete stale subscription", deleteErr);
          }
        } else if (result.success) {
          await updatePushSubscriptionLastUsed(sub.id);
        }

        return { subscriptionId: sub.id, success: result.success, deleted: result.shouldDelete };
      })
    );

    const successCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.success
    ).length;

    const deletedCount = results.filter(
      (r) => r.status === "fulfilled" && r.value.deleted
    ).length;

    logger.info(
      `[WebPush] Sent ${successCount}/${subscriptions.length} notifications to user ${userId}${deletedCount > 0 ? ` (cleaned up ${deletedCount} stale)` : ""}`
    );
  } catch (err) {
    logger.error("[WebPush] Failed to notify user", err);
  }
}
