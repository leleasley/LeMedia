import {
  cleanupEpisodeAirReminderSent,
  createNotification,
  type DiscordConfig,
  type EmailConfig,
  listNotificationEndpointsForUser,
  listEpisodeAirReminderTelegramTargets,
  listTrackedTvForEpisodeReminders,
  markEpisodeAirReminderSent,
  type TelegramConfig,
  type WebhookConfig,
} from "@/db";
import { logger } from "@/lib/logger";
import { getTv, getTvSeason } from "@/lib/tmdb";
import { notifyUserPushEvent } from "@/notifications/push-events";
import { sendDiscordWebhook } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";
import { getAppTimezone, getDateTimePartsInTimeZone, getIsoDateInTimeZone, isValidTimeZone, toUtcMsFromLocalDateTime } from "@/lib/app-timezone";
import { deliverWithReliability, NotificationDeliverySkipError } from "@/notifications/reliability";

type UpcomingEpisode = {
  tmdbId: number;
  seriesName: string;
  posterPath: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  airDate: string;
  airAtMs: number;
};

type PendingReminder = {
  episode: UpcomingEpisode;
  reminderType: string;
  leadMinutes: number;
  label: string;
};

type ReminderWindow = {
  type: "primary" | "secondary";
  leadMinutes: number;
  reminderType: string;
  label: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EPISODE_TIMEZONE = "Europe/London";

function getAppBaseUrl(): string | null {
  const candidates = [
    process.env.APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : null,
  ];
  for (const raw of candidates) {
    const base = raw?.trim();
    if (!base) continue;
    return base.replace(/\/+$/, "");
  }
  return null;
}

function episodeHref(tmdbId: number): string {
  const path = `/tv/${tmdbId}`;
  const base = getAppBaseUrl();
  return base ? `${base}${path}` : path;
}

function clampWhole(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.floor(value), min), max);
}

async function getEpisodeReminderTimezone(): Promise<string> {
  const candidate = String(
    process.env.EPISODE_AIR_REMINDER_TIMEZONE
      ?? process.env.RELEASE_NOTIFICATIONS_TIMEZONE
      ?? process.env.JOBS_TIMEZONE
      ?? process.env.TZ
      ?? DEFAULT_EPISODE_TIMEZONE
  ).trim();
  if (candidate && isValidTimeZone(candidate)) {
    return candidate;
  }
  return getAppTimezone();
}

function getAirAnchorHourLocal() {
  return clampWhole(Number(process.env.EPISODE_AIR_REMINDER_LOCAL_HOUR ?? "23"), 0, 23, 23);
}

function getAirAnchorMinuteLocal() {
  return clampWhole(Number(process.env.EPISODE_AIR_REMINDER_LOCAL_MINUTE ?? "59"), 0, 59, 59);
}

function toDateStringInTimeZone(utcMs: number, timeZone: string) {
  return getIsoDateInTimeZone(utcMs, timeZone);
}

function formatAirMoment(utcMs: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(new Date(utcMs));
}

function getMaxShowsPerUser(): number {
  const raw = Number(process.env.EPISODE_AIR_REMINDER_MAX_SHOWS_PER_USER ?? "80");
  if (!Number.isFinite(raw)) return 80;
  return Math.min(Math.max(Math.floor(raw), 10), 500);
}

function toEpisodeAirTimestampMs(
  airDate: string,
  timeZone: string,
  anchorHourLocal: number,
  anchorMinuteLocal: number
): number {
  // TMDB usually provides date-only values for episodes. We anchor them to a
  // configurable local clock time so reminders follow local day boundaries.
  const ms = toUtcMsFromLocalDateTime(airDate, anchorHourLocal, anchorMinuteLocal, timeZone);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

function formatEpisodeCode(seasonNumber: number, episodeNumber: number): string {
  const season = String(seasonNumber).padStart(2, "0");
  const episode = String(episodeNumber).padStart(2, "0");
  return `S${season}E${episode}`;
}

function formatLeadLabel(leadMinutes: number): string {
  const minutes = Math.max(1, Math.floor(leadMinutes));
  if (minutes >= 1440) {
    const days = Math.round(minutes / 1440);
    return `in about ${days} day${days === 1 ? "" : "s"}`;
  }
  if (minutes >= 60) {
    const hours = Math.round(minutes / 60);
    return `in about ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function shouldTriggerReminder(deltaMinutes: number, leadMinutes: number): boolean {
  const lead = Math.max(1, Math.floor(leadMinutes));
  const driftWindow = Math.min(Math.max(Math.floor(lead * 0.1), 30), 180);
  const minLead = Math.max(0, lead - driftWindow);
  return deltaMinutes <= lead && deltaMinutes >= minLead;
}

function reminderWindowsForTarget(target: {
  episodeReminderEnabled: boolean;
  episodeReminderPrimaryMinutes: number;
  episodeReminderSecondEnabled: boolean;
  episodeReminderSecondMinutes: number;
}): ReminderWindow[] {
  if (!target.episodeReminderEnabled) return [];

  const primaryMinutes = Math.min(Math.max(Math.floor(target.episodeReminderPrimaryMinutes || 1440), 1), 43200);
  const windows: ReminderWindow[] = [
    {
      type: "primary",
      leadMinutes: primaryMinutes,
      reminderType: `primary_${primaryMinutes}m`,
      label: formatLeadLabel(primaryMinutes),
    },
  ];

  if (target.episodeReminderSecondEnabled) {
    const secondMinutes = Math.min(Math.max(Math.floor(target.episodeReminderSecondMinutes || 60), 1), 43200);
    if (secondMinutes !== primaryMinutes) {
      windows.push({
        type: "secondary",
        leadMinutes: secondMinutes,
        reminderType: `secondary_${secondMinutes}m`,
        label: formatLeadLabel(secondMinutes),
      });
    }
  }

  return windows;
}

async function deliverEpisodeReminderToEndpoint(
  endpoint: any,
  userId: number,
  title: string,
  body: string,
  link: string,
  metadata: Record<string, unknown>
): Promise<"success" | "failure" | "skipped"> {
  if (endpoint.type === "telegram") {
    const cfg = endpoint.config as TelegramConfig;
    const botToken = String(cfg?.botToken ?? "").trim();
    const chatId = String(cfg?.chatId ?? "").trim();
    if (!botToken || !chatId) throw new NotificationDeliverySkipError("Telegram bot token or chat ID missing");
    const result = await deliverWithReliability(
      {
        endpointId: Number(endpoint.id),
        endpointType: String(endpoint.type),
        eventType: "episode_air_reminder",
        targetUserId: userId,
        metadata,
      },
      async () => {
        await sendTelegramMessage({ botToken, chatId, text: `📺 ${title}\n${body}\n${link}` });
      }
    );
    return result.status;
  }

  if (endpoint.type === "discord") {
    const cfg = endpoint.config as DiscordConfig;
    const webhookUrl = String(cfg?.webhookUrl ?? "").trim();
    if (!webhookUrl) throw new NotificationDeliverySkipError("Discord webhook URL is not configured");
    const result = await deliverWithReliability(
      {
        endpointId: Number(endpoint.id),
        endpointType: String(endpoint.type),
        eventType: "episode_air_reminder",
        targetUserId: userId,
        metadata,
      },
      async () => {
        await sendDiscordWebhook({ webhookUrl, content: `📺 **${title}**\n${body}\n${link}` });
      }
    );
    return result.status;
  }

  if (endpoint.type === "email") {
    const cfg = endpoint.config as EmailConfig;
    const to = String(cfg?.to ?? "").trim();
    if (!to) throw new NotificationDeliverySkipError("No recipient email configured");
    const result = await deliverWithReliability(
      {
        endpointId: Number(endpoint.id),
        endpointType: String(endpoint.type),
        eventType: "episode_air_reminder",
        targetUserId: userId,
        metadata,
      },
      async () => {
        await sendEmail({
          to,
          subject: `[LeMedia] ${title}`,
          text: `${body}\n\nOpen: ${link}`,
          html: `<p>${body}</p><p><a href="${link}">Open in LeMedia</a></p>`,
          smtp: cfg,
        });
      }
    );
    return result.status;
  }

  if (endpoint.type === "webhook") {
    const cfg = endpoint.config as WebhookConfig;
    const url = String(cfg?.url ?? "").trim();
    if (!url) throw new NotificationDeliverySkipError("Webhook URL is not configured");
    const result = await deliverWithReliability(
      {
        endpointId: Number(endpoint.id),
        endpointType: String(endpoint.type),
        eventType: "episode_air_reminder",
        targetUserId: userId,
        metadata,
      },
      async () => {
        await sendGenericWebhook({
          url,
          body: { event: "episode_air_reminder", title, message: body, link },
        });
      }
    );
    return result.status;
  }

  if (endpoint.type === "slack") {
    const webhookUrl = String((endpoint.config as any)?.webhookUrl ?? "").trim();
    if (!webhookUrl) throw new NotificationDeliverySkipError("Slack webhook URL is not configured");
    const result = await deliverWithReliability(
      {
        endpointId: Number(endpoint.id),
        endpointType: String(endpoint.type),
        eventType: "episode_air_reminder",
        targetUserId: userId,
        metadata,
      },
      async () => {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `[LeMedia] ${title}`,
            blocks: [{ type: "section", text: { type: "mrkdwn", text: `${body}\n${link}` } }],
          }),
        });
        if (!res.ok) throw new Error(`Slack webhook failed: HTTP ${res.status}`);
      }
    );
    return result.status;
  }

  if (endpoint.type === "gotify") {
    const baseUrl = String((endpoint.config as any)?.baseUrl ?? "").replace(/\/+$/, "");
    const token = String((endpoint.config as any)?.token ?? "").trim();
    if (!baseUrl || !token) throw new NotificationDeliverySkipError("Gotify base URL or token missing");
    const result = await deliverWithReliability(
      {
        endpointId: Number(endpoint.id),
        endpointType: String(endpoint.type),
        eventType: "episode_air_reminder",
        targetUserId: userId,
        metadata,
      },
      async () => {
        const res = await fetch(`${baseUrl}/message?token=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, message: `${body}\n${link}`, priority: 8 }),
        });
        if (!res.ok) throw new Error(`Gotify request failed: HTTP ${res.status}`);
      }
    );
    return result.status;
  }

  if (endpoint.type === "ntfy") {
    const topic = String((endpoint.config as any)?.topic ?? "").trim();
    const baseUrl = String((endpoint.config as any)?.baseUrl ?? "https://ntfy.sh").replace(/\/+$/, "");
    if (!topic) throw new NotificationDeliverySkipError("ntfy topic is not configured");
    const result = await deliverWithReliability(
      {
        endpointId: Number(endpoint.id),
        endpointType: String(endpoint.type),
        eventType: "episode_air_reminder",
        targetUserId: userId,
        metadata,
      },
      async () => {
        const res = await fetch(`${baseUrl}/${encodeURIComponent(topic)}`, {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: `${title}\n\n${body}\n${link}`,
        });
        if (!res.ok) throw new Error(`ntfy request failed: HTTP ${res.status}`);
      }
    );
    return result.status;
  }

  if (endpoint.type === "pushbullet") {
    const accessToken = String((endpoint.config as any)?.accessToken ?? "").trim();
    if (!accessToken) throw new NotificationDeliverySkipError("Pushbullet access token is not configured");
    const result = await deliverWithReliability(
      {
        endpointId: Number(endpoint.id),
        endpointType: String(endpoint.type),
        eventType: "episode_air_reminder",
        targetUserId: userId,
        metadata,
      },
      async () => {
        const res = await fetch("https://api.pushbullet.com/v2/pushes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Access-Token": accessToken,
          },
          body: JSON.stringify({ type: "note", title, body: `${body}\n${link}` }),
        });
        if (!res.ok) throw new Error(`Pushbullet request failed: HTTP ${res.status}`);
      }
    );
    return result.status;
  }

  if (endpoint.type === "pushover") {
    const apiToken = String((endpoint.config as any)?.apiToken ?? "").trim();
    const userKey = String((endpoint.config as any)?.userKey ?? "").trim();
    if (!apiToken || !userKey) throw new NotificationDeliverySkipError("Pushover token or user key missing");
    const result = await deliverWithReliability(
      {
        endpointId: Number(endpoint.id),
        endpointType: String(endpoint.type),
        eventType: "episode_air_reminder",
        targetUserId: userId,
        metadata,
      },
      async () => {
        const params = new URLSearchParams({
          token: apiToken,
          user: userKey,
          title,
          message: `${body}\n${link}`,
        });
        const res = await fetch("https://api.pushover.net/1/messages.json", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: params.toString(),
        });
        if (!res.ok) throw new Error(`Pushover request failed: HTTP ${res.status}`);
      }
    );
    return result.status;
  }

  throw new NotificationDeliverySkipError(`Unsupported endpoint type: ${String(endpoint.type)}`);
}

async function getUpcomingEpisodesForShow(
  tmdbId: number,
  windowStartMs: number,
  windowEndMs: number,
  timeZone: string,
  anchorHourLocal: number,
  anchorMinuteLocal: number
): Promise<UpcomingEpisode[]> {
  const tv = await getTv(tmdbId);
  if (!tv) return [];

  if (tv.status === "Ended" || tv.status === "Canceled") {
    return [];
  }

  const nowDateStr = toDateStringInTimeZone(windowStartMs - DAY_MS * 14, timeZone);
  const futureDateStr = toDateStringInTimeZone(windowEndMs + DAY_MS * 30, timeZone);

  const seasons = Array.isArray(tv.seasons)
    ? tv.seasons.filter((season: any) => season?.season_number > 0)
    : [];

  let candidateSeasons = seasons.filter((season: any) => {
    const airDate = String(season?.air_date ?? "");
    return airDate && airDate >= nowDateStr && airDate <= futureDateStr;
  });

  if (!candidateSeasons.length) {
    candidateSeasons = seasons.slice(-2);
  }

  const upcoming: UpcomingEpisode[] = [];
  const seen = new Set<string>();

  for (const season of candidateSeasons) {
    try {
      const seasonDetails = await getTvSeason(tmdbId, season.season_number);
      const episodes = Array.isArray(seasonDetails?.episodes) ? seasonDetails.episodes : [];

      for (const episode of episodes) {
        const airDate = String(episode?.air_date ?? "");
        if (!airDate) continue;
        const airAtMs = toEpisodeAirTimestampMs(airDate, timeZone, anchorHourLocal, anchorMinuteLocal);
        if (!Number.isFinite(airAtMs)) continue;
        if (airAtMs <= windowStartMs || airAtMs > windowEndMs) continue;

        const seasonNumber = Number(episode?.season_number ?? season.season_number ?? 0);
        const episodeNumber = Number(episode?.episode_number ?? 0);
        if (seasonNumber <= 0 || episodeNumber <= 0) continue;

        const dedupeKey = `${tmdbId}:${seasonNumber}:${episodeNumber}:${airDate}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        upcoming.push({
          tmdbId,
          seriesName: String(tv.name ?? "Unknown Series"),
          posterPath: (tv.poster_path as string | null) ?? null,
          seasonNumber,
          episodeNumber,
          episodeName: String(episode?.name ?? "TBA"),
          airDate,
          airAtMs,
        });
      }
    } catch (error) {
      logger.debug(`[EpisodeAirReminders] Failed to inspect season ${season?.season_number} for TMDB ${tmdbId}`, {
        tmdbId,
        seasonNumber: season?.season_number,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  upcoming.sort((a, b) => a.airAtMs - b.airAtMs);
  return upcoming;
}

export async function sendEpisodeAirRemindersJob(): Promise<string> {
  const maxShowsPerUser = getMaxShowsPerUser();
  const timeZone = await getEpisodeReminderTimezone();
  const anchorHourLocal = getAirAnchorHourLocal();
  const anchorMinuteLocal = getAirAnchorMinuteLocal();
  const windowStartMs = Date.now();

  const tracked = await listTrackedTvForEpisodeReminders(maxShowsPerUser);
  if (!tracked.length) {
    await cleanupEpisodeAirReminderSent(60).catch(() => {});
    return "no tracked TV shows";
  }

  const trackedUserIds = Array.from(new Set(tracked.map((row) => row.userId)));
  const reminderTargets = await listEpisodeAirReminderTelegramTargets(trackedUserIds);
  const defaultMaxLeadMinutes = 1440;
  const maxLeadMinutes = Math.max(
    defaultMaxLeadMinutes,
    ...Array.from(reminderTargets.values()).flatMap((target) => {
      const leads = [target.episodeReminderPrimaryMinutes];
      if (target.episodeReminderSecondEnabled) leads.push(target.episodeReminderSecondMinutes);
      return leads;
    })
  );
  const windowEndMs = windowStartMs + maxLeadMinutes * 60 * 1000;

  const uniqueShowIds = Array.from(new Set(tracked.map((row) => row.tmdbId)));
  const showUpcomingMap = new Map<number, UpcomingEpisode[]>();
  let showErrors = 0;

  for (const tmdbId of uniqueShowIds) {
    try {
      const upcoming = await getUpcomingEpisodesForShow(
        tmdbId,
        windowStartMs,
        windowEndMs,
        timeZone,
        anchorHourLocal,
        anchorMinuteLocal
      );
      showUpcomingMap.set(tmdbId, upcoming);
    } catch (error) {
      showErrors += 1;
      logger.warn(`[EpisodeAirReminders] Failed to fetch upcoming episodes for TMDB ${tmdbId}`, {
        tmdbId,
        error: error instanceof Error ? error.message : String(error),
      });
      showUpcomingMap.set(tmdbId, []);
    }
  }

  const pendingByUser = new Map<number, PendingReminder[]>();

  for (const row of tracked) {
    const upcoming = showUpcomingMap.get(row.tmdbId) ?? [];
    if (!upcoming.length) continue;

    for (const episode of upcoming) {
      const targetPrefs = reminderTargets.get(row.userId) ?? {
        telegramId: null,
        telegramFollowOptIn: false,
        episodeReminderEnabled: true,
        episodeReminderPrimaryMinutes: 1440,
        episodeReminderSecondEnabled: true,
        episodeReminderSecondMinutes: 60,
        episodeReminderTelegramEnabled: true,
        reminderTimezone: null,
      };
      const deltaMinutes = (episode.airAtMs - windowStartMs) / (60 * 1000);
      const windows = reminderWindowsForTarget(targetPrefs);

      for (const window of windows) {
        if (!shouldTriggerReminder(deltaMinutes, window.leadMinutes)) continue;

        const shouldSend = await markEpisodeAirReminderSent({
          userId: row.userId,
          tmdbId: episode.tmdbId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          airDate: episode.airDate,
          reminderType: window.reminderType,
        });

        if (!shouldSend) continue;

        if (!pendingByUser.has(row.userId)) {
          pendingByUser.set(row.userId, []);
        }
        pendingByUser.get(row.userId)!.push({
          episode,
          reminderType: window.reminderType,
          leadMinutes: window.leadMinutes,
          label: window.label,
        });
      }
    }
  }

  if (!pendingByUser.size) {
    await cleanupEpisodeAirReminderSent(60).catch(() => {});
    return `tracked=${tracked.length} shows=${uniqueShowIds.length} reminders=0`;
  }

  const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

  let sent = 0;
  let failed = 0;
  let telegramSent = 0;
  let pushSent = 0;
  let endpointSent = 0;

  for (const [userId, entries] of pendingByUser.entries()) {
    const target = reminderTargets.get(userId) ?? {
      telegramId: null,
      telegramFollowOptIn: false,
      episodeReminderEnabled: true,
      episodeReminderPrimaryMinutes: 1440,
      episodeReminderSecondEnabled: true,
      episodeReminderSecondMinutes: 60,
      episodeReminderTelegramEnabled: true,
      reminderTimezone: null,
    };
    const userTimeZone = target.reminderTimezone && isValidTimeZone(target.reminderTimezone)
      ? target.reminderTimezone
      : timeZone;
    const endpoints = await listNotificationEndpointsForUser(userId).catch(() => []);

    for (const { episode, reminderType, leadMinutes, label } of entries) {
      const airMoment = formatAirMoment(episode.airAtMs, userTimeZone);
      const episodeCode = formatEpisodeCode(episode.seasonNumber, episode.episodeNumber);
      const title = `${episode.seriesName} ${episodeCode} airs ${label}`;
      const body = `${episode.episodeName} is expected around ${airMoment}.`;
      const link = episodeHref(episode.tmdbId);

      try {
        await createNotification({
          userId,
          type: "episode_air_reminder",
          title,
          message: body,
          link,
          metadata: {
            tmdbId: episode.tmdbId,
            seasonNumber: episode.seasonNumber,
            episodeNumber: episode.episodeNumber,
            airDate: episode.airDate,
            reminderType,
            leadMinutes,
            reminderTimezone: userTimeZone,
          },
        });

        await notifyUserPushEvent(userId, {
          title,
          body,
          tag: `episode-air-${episode.tmdbId}-${episode.seasonNumber}-${episode.episodeNumber}`,
          url: link,
        });
        pushSent += 1;

        for (const endpoint of endpoints) {
          if (Array.isArray(endpoint.events) && endpoint.events.length > 0 && !endpoint.events.includes("episode_air_reminder")) {
            continue;
          }
          try {
            const status = await deliverEpisodeReminderToEndpoint(endpoint, userId, title, body, link, {
              reminderType,
              tmdbId: episode.tmdbId,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
              airDate: episode.airDate,
            });
            if (status === "success") endpointSent += 1;
          } catch (err) {
            logger.warn("[EpisodeAirReminders] Endpoint delivery failed", {
              userId,
              endpointType: endpoint.type,
              endpointId: endpoint.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (
          botToken &&
          target.telegramId &&
          target.episodeReminderTelegramEnabled
        ) {
          await sendTelegramMessage({
            botToken,
            chatId: target.telegramId,
            text: `📺 ${title}\n${body}\n${link}`,
          });
          telegramSent += 1;
        }

        sent += 1;
      } catch (error) {
        failed += 1;
        logger.warn("[EpisodeAirReminders] Failed to send reminder", {
          userId,
          tmdbId: episode.tmdbId,
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  await cleanupEpisodeAirReminderSent(60).catch(() => {});

  return `tracked=${tracked.length} shows=${uniqueShowIds.length} reminders=${sent} failed=${failed} push=${pushSent} endpoint=${endpointSent} telegram=${telegramSent} showErrors=${showErrors} tz=${timeZone}`;
}
