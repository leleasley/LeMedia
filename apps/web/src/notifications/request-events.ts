import {
  listGlobalNotificationEndpointsFull,
  listNotificationEndpointsForUser,
  NotificationEndpointFull,
  getUserById,
  getTelegramUserByUserId,
  type DiscordConfig,
  type TelegramConfig,
  type EmailConfig,
  type WebhookConfig
} from "@/db";
import { DiscordEmbed, sendDiscordWebhook } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";
import { notifyUserPushEvent } from "@/notifications/push-events";
import { logger } from "@/lib/logger";
import { getMovie, getTv } from "@/lib/tmdb";
import { deliverWithReliability, NotificationDeliverySkipError } from "@/notifications/reliability";
import {
  NOTIFICATION_TYPE_BIT_REQUEST_AVAILABLE,
  NOTIFICATION_TYPE_BIT_REQUEST_DENIED,
  NOTIFICATION_TYPE_BIT_REQUEST_DOWNLOADING,
  NOTIFICATION_TYPE_BIT_REQUEST_FAILED,
  NOTIFICATION_TYPE_BIT_REQUEST_PARTIALLY_AVAILABLE,
  NOTIFICATION_TYPE_BIT_REQUEST_PENDING,
  NOTIFICATION_TYPE_BIT_REQUEST_SUBMITTED
} from "@/lib/notification-type-bits";

export type RequestNotificationEvent =
  | "request_pending"
  | "request_submitted"
  | "request_denied"
  | "request_failed"
  | "request_already_exists"
  | "request_partially_available"
  | "request_downloading"
  | "request_available"
  | "request_removed";

export type RequestNotificationContext = {
  requestId: string;
  requestType: "movie" | "episode";
  tmdbId: number;
  title: string;
  username: string;
  userId?: number;
  imageUrl?: string | null;
  rating?: number | null;
  year?: number | null;
  overview?: string | null;
  sonarrSeriesId?: number | null;
  tvdbId?: number | null;
};

const DISCORD_COLORS = {
  ORANGE: 15105570,
  PURPLE: 10181046,
  GREEN: 3066993,
  RED: 15158332,
  GREY: 9807270
};

const EVENT_TYPE_MAP: Record<RequestNotificationEvent, number> = {
  request_pending: NOTIFICATION_TYPE_BIT_REQUEST_PENDING,
  request_submitted: NOTIFICATION_TYPE_BIT_REQUEST_SUBMITTED,
  request_available: NOTIFICATION_TYPE_BIT_REQUEST_AVAILABLE,
  request_denied: NOTIFICATION_TYPE_BIT_REQUEST_DENIED,
  request_failed: NOTIFICATION_TYPE_BIT_REQUEST_FAILED,
  request_already_exists: NOTIFICATION_TYPE_BIT_REQUEST_PENDING,
  request_partially_available: NOTIFICATION_TYPE_BIT_REQUEST_PARTIALLY_AVAILABLE,
  request_downloading: NOTIFICATION_TYPE_BIT_REQUEST_DOWNLOADING,
  request_removed: NOTIFICATION_TYPE_BIT_REQUEST_FAILED
};

function getAppBaseUrl(): string | null {
  const candidates = [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null
  ];
  for (const raw of candidates) {
    const base = raw?.trim();
    if (!base) continue;
    return base.replace(/\/+$/, "");
  }
  return null;
}

function requestHref(ctx: RequestNotificationContext): string {
  const path = ctx.requestType === "movie" ? `/movie/${ctx.tmdbId}` : `/tv/${ctx.tmdbId}`;
  const base = getAppBaseUrl();
  return base ? `${base}${path}` : path;
}

function humanEvent(event: RequestNotificationEvent): string {
  switch (event) {
    case "request_pending":
      return "Pending approval";
    case "request_submitted":
      return "Approved / submitted";
    case "request_denied":
      return "Denied";
    case "request_failed":
      return "Failed";
    case "request_already_exists":
      return "Already exists";
    case "request_partially_available":
      return "Partially available";
    case "request_downloading":
      return "Downloading";
    case "request_available":
      return "Available";
    case "request_removed":
      return "Removed";
  }
}

function subject(event: RequestNotificationEvent, title: string) {
  return `[LeMedia] ${humanEvent(event)}: ${title}`;
}

function clampText(value: string | null | undefined, max = 2000) {
  if (!value) return "";
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

function requestStatusColor(event: RequestNotificationEvent) {
  switch (event) {
    case "request_pending":
      return DISCORD_COLORS.ORANGE;
    case "request_submitted":
      return DISCORD_COLORS.PURPLE;
    case "request_partially_available":
      return DISCORD_COLORS.PURPLE;
    case "request_downloading":
      return DISCORD_COLORS.ORANGE;
    case "request_available":
      return DISCORD_COLORS.GREEN;
    case "request_denied":
    case "request_failed":
      return DISCORD_COLORS.RED;
    case "request_removed":
    case "request_already_exists":
      return DISCORD_COLORS.GREY;
  }
}

function buildRequestDiscordEmbed(
  event: RequestNotificationEvent,
  ctx: RequestNotificationContext,
  href: string
): DiscordEmbed {
  const status = humanEvent(event);
  const fields = [
    { name: "Requested By", value: ctx.username, inline: true },
    { name: "Request Status", value: status, inline: true }
  ];
  if (ctx.year) {
    fields.push({ name: "Year", value: String(ctx.year), inline: true });
  }
  if (ctx.rating) {
    fields.push({ name: "Rating", value: `⭐ ${ctx.rating.toFixed(1)}/10`, inline: true });
  }

  return {
    title: ctx.title || status,
    description: clampText(ctx.overview),
    url: href,
    color: requestStatusColor(event),
    timestamp: new Date().toISOString(),
    author: { name: status },
    fields,
    thumbnail: ctx.imageUrl ? { url: ctx.imageUrl } : undefined
  };
}

function shouldSend(endpoint: NotificationEndpointFull, event: RequestNotificationEvent): boolean {
  if (!endpoint.enabled) return false;
  const mask = EVENT_TYPE_MAP[event] ?? 0;
  if (typeof endpoint.types === "number" && endpoint.types > 0) {
    if (mask === 0) return true;
    return (endpoint.types & mask) === mask;
  }
  if (!Array.isArray(endpoint.events) || endpoint.events.length === 0) return true;
  return endpoint.events.includes(event);
}

function dedupe(endpoints: NotificationEndpointFull[]): NotificationEndpointFull[] {
  const seen = new Set<number>();
  const out: NotificationEndpointFull[] = [];
  for (const e of endpoints) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out;
}

export async function notifyRequestEvent(event: RequestNotificationEvent, ctx: RequestNotificationContext) {
  const enabled = (process.env.NOTIFICATIONS_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled) return;

  // Fill missing TMDB metadata so embeds have context and artwork
  try {
    const needsEnrichment = !ctx.imageUrl || !ctx.overview || !ctx.year || !ctx.rating;
    if (needsEnrichment) {
      const tmdb = ctx.requestType === "movie" ? await getMovie(ctx.tmdbId) : await getTv(ctx.tmdbId);
      if (tmdb) {
        if (!ctx.imageUrl && tmdb.poster_path) {
          ctx.imageUrl = `https://image.tmdb.org/t/p/w500${tmdb.poster_path}`;
        }
        if (!ctx.overview && tmdb.overview) {
          ctx.overview = tmdb.overview;
        }
        if (!ctx.year) {
          const year =
            ctx.requestType === "movie"
              ? tmdb.release_date
              : (tmdb as any).first_air_date;
          ctx.year = year ? Number(String(year).slice(0, 4)) : null;
        }
        if (!ctx.rating && typeof tmdb.vote_average === "number") {
          ctx.rating = tmdb.vote_average;
        }
      }
    }
  } catch (err) {
    logger.warn("[notify] failed to enrich TMDB metadata", { error: err instanceof Error ? err.message : String(err) });
  }

  const [globalEndpoints, userEndpoints] = await Promise.all([
    listGlobalNotificationEndpointsFull(),
    ctx.userId ? listNotificationEndpointsForUser(ctx.userId) : Promise.resolve([])
  ]);

  const endpoints = dedupe([...globalEndpoints, ...userEndpoints]).filter(e => shouldSend(e, event));
  if (endpoints.length === 0) return;

  const href = requestHref(ctx);
  const title = ctx.title || `${ctx.requestType.toUpperCase()} ${ctx.tmdbId}`;
  const status = humanEvent(event);
  const metaHeadlines = [];
  if (ctx.year) metaHeadlines.push(String(ctx.year));
  if (ctx.rating) metaHeadlines.push(`⭐ ${ctx.rating.toFixed(1)}/10`);
  const metaLine = metaHeadlines.join(" • ");
  const overviewLine = ctx.overview ? `Overview: ${ctx.overview}` : "";
  const imageLine = ctx.imageUrl ? `![${title}](${ctx.imageUrl})` : "";

  const plain = [
    `${status}: ${title}`,
    metaLine,
    overviewLine,
    imageLine,
    `Requested by: ${ctx.username}`,
    href
  ]
    .filter(Boolean)
    .join("\n");
  const emailSubject = subject(event, title);
  const webhookPayload = {
    type: "lemedia.request_event",
    event,
    status,
    title,
    tmdb_id: ctx.tmdbId,
    request_type: ctx.requestType,
    request_id: ctx.requestId,
    requested_by: {
      username: ctx.username,
      user_id: ctx.userId
    },
    image_url: ctx.imageUrl,
    rating: ctx.rating,
    year: ctx.year,
    overview: ctx.overview,
    sonarr_series_id: ctx.sonarrSeriesId ?? null,
    tvdb_id: ctx.tvdbId ?? null,
    url: href,
    sent_at: new Date().toISOString()
  };
  const discordEmbed = buildRequestDiscordEmbed(event, ctx, href);
  const userRecord =
    ctx.userId && Number.isFinite(ctx.userId) ? await getUserById(ctx.userId ?? 0) : null;
  const discordUserId = userRecord?.discordUserId ?? null;
  const userEmail = userRecord?.email ?? null;
  const discordContent = discordUserId
    ? `<@${discordUserId}> ${status}: ${title} - ${href}`
    : `${status}: ${title} - ${href}`;

  // Send web push notifications to the user
  if (ctx.userId) {
    notifyUserPushEvent(ctx.userId, {
      title: subject(event, title),
      body: `${status} - ${title}`,
      icon: ctx.imageUrl ?? undefined,
      url: href,
      tag: `request-${ctx.requestId}`,
    }).catch((err) => {
      logger.error(`[notify] Web push notification failed for user ${ctx.userId}`, err);
    });
  }

  // Send bot DM to user if they have Telegram linked
  const BOT_DM_EVENTS: RequestNotificationEvent[] = [
    "request_available", "request_denied", "request_downloading",
    "request_partially_available", "request_failed"
  ];
  if (ctx.userId && BOT_DM_EVENTS.includes(event)) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (botToken) {
      getTelegramUserByUserId(ctx.userId).then(tgUser => {
        if (!tgUser?.telegram_id) return;
        const icon = event === "request_available" ? "✅"
          : event === "request_denied" ? "❌"
          : event === "request_downloading" ? "⬇️"
          : event === "request_partially_available" ? "📺"
          : "⚠️";
        const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const linkLine = href ? `\n<a href="${href}">View in LeMedia →</a>` : "";
        const msg = `${icon} <b>${esc(title)}</b>\n<i>${esc(status)}</i>${linkLine}`;
        return sendTelegramMessage({ botToken, chatId: tgUser.telegram_id, text: msg, parseMode: "HTML" });
      }).catch(err => {
        logger.warn("[notify] Bot DM failed", { userId: ctx.userId, error: err?.message });
      });
    }
  }

  await Promise.all(
    endpoints.map(async endpoint => {
      await deliverWithReliability(
        {
          endpointId: endpoint.id,
          endpointType: endpoint.type,
          eventType: event,
          targetUserId: ctx.userId ?? null,
          metadata: { requestId: ctx.requestId, tmdbId: ctx.tmdbId, requestType: ctx.requestType }
        },
        async () => {
          if (endpoint.type === "discord") {
            const config = endpoint.config as DiscordConfig;
            const webhookUrl = String(config?.webhookUrl ?? "");
            if (!webhookUrl) throw new NotificationDeliverySkipError("Discord webhook URL is not configured");
            await sendDiscordWebhook({
              webhookUrl,
              content: discordContent,
              embeds: [discordEmbed],
              allowedMentions: discordUserId ? { users: [discordUserId], parse: [] } : undefined
            });
            return;
          }
          if (endpoint.type === "telegram") {
            const config = endpoint.config as TelegramConfig;
            const botToken = String(config?.botToken ?? "");
            const chatId = String(config?.chatId ?? "");
            if (!botToken || !chatId) throw new NotificationDeliverySkipError("Telegram bot token or chat ID missing");
            await sendTelegramMessage({ botToken, chatId, text: plain });
            return;
          }
          if (endpoint.type === "email") {
            const config = endpoint.config as EmailConfig;
            const configuredTo = String(config?.to ?? "").trim();
            if (!configuredTo && config?.userEmailRequired && !userEmail) {
              throw new NotificationDeliverySkipError("Endpoint requires user email, but user has no email");
            }
            const to = configuredTo || String(userEmail ?? "").trim();
            if (!to) throw new NotificationDeliverySkipError("No recipient email configured");
            await sendEmail({ to, subject: emailSubject, text: plain, smtp: config });
            return;
          }
          if (endpoint.type === "webhook") {
            const config = endpoint.config as WebhookConfig;
            const url = String(config?.url ?? "");
            if (!url) throw new NotificationDeliverySkipError("Webhook URL is not configured");
            await sendGenericWebhook({ url, body: webhookPayload });
            return;
          }
          throw new NotificationDeliverySkipError(`Unsupported endpoint type for request events: ${(endpoint as { type: string }).type}`);
        }
      );
    })
  );
}
