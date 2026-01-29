import {
  listActiveCalendarSubscriptions,
  disableCalendarSubscriptionNotifications,
  getUserById,
  listNotificationEndpointsForUser,
  type DiscordConfig,
  type TelegramConfig,
  type EmailConfig,
  type WebhookConfig,
} from "@/db";
import { isAvailableByExternalIds } from "@/lib/jellyfin";
import { getMovie, getTv } from "@/lib/tmdb";
import { logger } from "@/lib/logger";
import { sendDiscordWebhook, DiscordEmbed } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";
import { notifyUserPushEvent } from "@/notifications/push-events";

/**
 * Check calendar subscriptions and notify users when content becomes available
 * This function is meant to be run periodically (e.g., every 30 minutes)
 */
export async function checkCalendarSubscriptions(): Promise<{
  checked: number;
  notified: number;
  errors: number;
}> {
  let checked = 0;
  let notified = 0;
  let errors = 0;

  try {
    // Get all active subscriptions
    const subscriptions = await listActiveCalendarSubscriptions();

    logger.info(`[Calendar Notifications] Checking ${subscriptions.length} subscriptions`);

    // Process subscriptions in batches of 10 to avoid overwhelming APIs
    const batchSize = 10;
    for (let i = 0; i < subscriptions.length; i += batchSize) {
      const batch = subscriptions.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (subscription) => {
          try {
            checked++;

            // Check if content is available in Jellyfin
            const isAvailable = await isAvailableByExternalIds(
              subscription.eventType.includes("movie") ? "movie" : "tv",
              subscription.tmdbId,
              undefined // tvdbId not stored in subscription
            );

            if (!isAvailable) {
              // Not available yet, skip
              return;
            }

            // Content is available! Send notification
            logger.info(
              `[Calendar Notifications] Content available for subscription ${subscription.id}: TMDB ${subscription.tmdbId}`
            );

            await sendCalendarNotification(subscription);
            notified++;

            // Disable notifications for this subscription
            await disableCalendarSubscriptionNotifications(subscription.id);
          } catch (error) {
            errors++;
            logger.error(
              `[Calendar Notifications] Error processing subscription ${subscription.id}:`,
              error
            );
          }
        })
      );
    }

    logger.info(
      `[Calendar Notifications] Complete: ${checked} checked, ${notified} notified, ${errors} errors`
    );

    return { checked, notified, errors };
  } catch (error) {
    logger.error("[Calendar Notifications] Fatal error:", error);
    throw error;
  }
}

/**
 * Send notification for a calendar subscription
 */
async function sendCalendarNotification(subscription: any) {
  try {
    // Get user details
    const user = await getUserById(subscription.userId);
    if (!user) {
      logger.warn(`[Calendar Notifications] User not found: ${subscription.userId}`);
      return;
    }

    // Fetch media details from TMDB
    const mediaType = subscription.eventType.includes("movie") ? "movie" : "tv";
    const mediaDetails =
      mediaType === "movie"
        ? await getMovie(subscription.tmdbId)
        : await getTv(subscription.tmdbId);

    if (!mediaDetails) {
      logger.warn(
        `[Calendar Notifications] Media not found: ${mediaType} ${subscription.tmdbId}`
      );
      return;
    }

    const title =
      mediaType === "movie"
        ? mediaDetails.title || "Unknown Movie"
        : mediaDetails.name || "Unknown Show";

    // Get notification endpoints for user
    const endpoints = await listNotificationEndpointsForUser(subscription.userId);

    // Send to each enabled endpoint
    for (const endpoint of endpoints) {
      if (!endpoint.enabled) continue;

      try {
        if (endpoint.type === "discord") {
          const config = endpoint.config as DiscordConfig;
          const webhookUrl = String(config?.webhookUrl ?? "");
          if (!webhookUrl) continue;
          await sendDiscordNotification(webhookUrl, title, mediaDetails, mediaType);
        } else if (endpoint.type === "telegram") {
          const config = endpoint.config as TelegramConfig;
          const botToken = String(config?.botToken ?? "");
          const chatId = String(config?.chatId ?? "");
          if (!botToken || !chatId) continue;
          await sendTelegramNotification(botToken, chatId, title);
        } else if (endpoint.type === "email") {
          const config = endpoint.config as EmailConfig;
          const configuredTo = String(config?.to ?? "").trim();
          if (!configuredTo && config?.userEmailRequired && !user.email) continue;
          const to = configuredTo || String(user.email ?? "").trim();
          if (!to) continue;
          await sendEmailNotification(to, user.username, title, config);
        } else if (endpoint.type === "webhook") {
          const config = endpoint.config as WebhookConfig;
          const url = String(config?.url ?? "");
          if (!url) continue;
          await sendWebhookNotification(url, title, subscription);
        }
      } catch (error) {
        logger.error(`[Calendar Notifications] Error sending to ${endpoint.type}:`, error);
      }
    }
  } catch (error) {
    logger.error("[Calendar Notifications] Error in sendCalendarNotification:", error);
    throw error;
  }
}

function getMediaUrl(mediaType: "movie" | "tv", tmdbId: number): string {
  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  return `${base}/${mediaType}/${tmdbId}`;
}

async function sendDiscordNotification(
  webhookUrl: string,
  title: string,
  mediaDetails: any,
  mediaType: "movie" | "tv"
) {
  const posterPath = mediaDetails.poster_path;
  const imageUrl = posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null;
  const overview = mediaDetails.overview || "No description available";

  const embed: DiscordEmbed = {
    title: `🎉 ${title} is now available!`,
    description: overview.slice(0, 300) + (overview.length > 300 ? "..." : ""),
    color: 3066993, // Green
    url: getMediaUrl(mediaType, mediaDetails.id),
    thumbnail: imageUrl ? { url: imageUrl } : undefined,
    fields: [
      {
        name: "Status",
        value: "✓ Available in Jellyfin",
        inline: true,
      },
    ],
  };

  if (mediaType === "movie" && mediaDetails.release_date) {
    embed.fields?.push({
      name: "Release Date",
      value: mediaDetails.release_date,
      inline: true,
    });
  } else if (mediaType === "tv" && mediaDetails.first_air_date) {
    embed.fields?.push({
      name: "First Air Date",
      value: mediaDetails.first_air_date,
      inline: true,
    });
  }

  await sendDiscordWebhook({
    webhookUrl,
    embeds: [embed],
  });
}

async function sendTelegramNotification(botToken: string, chatId: string, title: string) {
  const message = `🎉 *${title}* is now available!\n\nYou can watch it now in Jellyfin.`;
  await sendTelegramMessage({
    botToken,
    chatId,
    text: message,
  });
}

async function sendEmailNotification(
  email: string,
  username: string,
  title: string,
  smtpConfig?: EmailConfig
) {
  await sendEmail({
    to: email,
    subject: `[LeMedia] ${title} is now available`,
    text: `Hi ${username},\n\nGood news! ${title} is now available to watch in Jellyfin.\n\nEnjoy!\n\n- LeMedia`,
    html: `
      <p>Hi ${username},</p>
      <p>Good news! <strong>${title}</strong> is now available to watch in Jellyfin.</p>
      <p>Enjoy!</p>
      <p>- LeMedia</p>
    `,
    smtp: smtpConfig
  });
}

async function sendWebhookNotification(webhookUrl: string, title: string, subscription: any) {
  await sendGenericWebhook({
    url: webhookUrl,
    body: {
      event: "calendar_available",
      title,
      tmdbId: subscription.tmdbId,
      eventType: subscription.eventType,
      timestamp: new Date().toISOString(),
    },
  });
}
