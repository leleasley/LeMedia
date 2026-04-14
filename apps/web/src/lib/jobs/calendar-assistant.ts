import {
  createNotification,
  getTelegramUserByUserId,
  listCalendarAssistantRecipients,
  listNotificationEndpointsForUser,
  markCalendarAssistantSentDate,
  type DiscordConfig,
  type EmailConfig,
  type TelegramConfig,
  type WebhookConfig,
} from "@/db";
import { getAppTimezone, getDateTimePartsInTimeZone, getIsoDateInTimeZone, isValidTimeZone } from "@/lib/app-timezone";
import { logger } from "@/lib/logger";
import { getUpcomingMoviesAccurateCombined, getUpcomingTvAccurate } from "@/lib/tmdb";
import { sendDiscordWebhook } from "@/notifications/discord";
import { sendEmail } from "@/notifications/email";
import { sendTelegramMessage } from "@/notifications/telegram";
import { sendGenericWebhook } from "@/notifications/webhook";

type UpcomingItem = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  date: string;
};

type CalendarDigest = {
  title: string;
  body: string;
  link: string;
  metadata: Record<string, unknown>;
};

const DEFAULT_TIMEZONE = "Europe/London";

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(base: Date, days: number) {
  const out = new Date(base);
  out.setDate(out.getDate() + days);
  return out;
}

function formatDate(value: string, timeZone: string) {
  const date = parseDate(value);
  if (!date) return "TBA";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone,
  }).format(date);
}

function getBaseUrl() {
  return String(process.env.APP_BASE_URL ?? "http://localhost:3010").replace(/\/+$/, "");
}

function parseChannels(raw: string | null | undefined): Set<string> {
  const allowed = new Set(["in_app", "telegram", "endpoints"]);
  const values = String(raw ?? "in_app")
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .filter((part) => allowed.has(part));
  if (values.length === 0) return new Set(["in_app"]);
  return new Set(values);
}

async function resolveTimezone() {
  const preferred = String(process.env.CALENDAR_ASSISTANT_TIMEZONE ?? process.env.JOBS_TIMEZONE ?? process.env.TZ ?? DEFAULT_TIMEZONE).trim();
  if (preferred && isValidTimeZone(preferred)) return preferred;
  return getAppTimezone();
}

async function loadUpcomingItems(timeZone: string): Promise<UpcomingItem[]> {
  const [moviePage, tvPage] = await Promise.all([
    getUpcomingMoviesAccurateCombined(1),
    getUpcomingTvAccurate(1),
  ]);

  const now = new Date();
  const maxDate = addDays(now, 10);

  const movies = (moviePage.results ?? [])
    .filter((item: any) => item?.id && item?.title && item?.release_date)
    .map((item: any) => ({
      mediaType: "movie" as const,
      tmdbId: Number(item.id),
      title: String(item.title),
      date: String(item.release_date),
    }));

  const tv = (tvPage.results ?? [])
    .filter((item: any) => item?.id && item?.name && item?.first_air_date)
    .map((item: any) => ({
      mediaType: "tv" as const,
      tmdbId: Number(item.id),
      title: String(item.name),
      date: String(item.first_air_date),
    }));

  const merged = [...movies, ...tv]
    .filter((item) => {
      const parsed = parseDate(item.date);
      if (!parsed) return false;
      return parsed >= now && parsed <= maxDate;
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const seen = new Set<string>();
  const deduped: UpcomingItem[] = [];
  for (const item of merged) {
    const key = `${item.mediaType}:${item.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
    if (deduped.length >= 6) break;
  }

  if (!deduped.length) {
    logger.info("[calendar-assistant] no upcoming items in date window", { timeZone });
  }
  return deduped;
}

function buildDigest(items: UpcomingItem[], timeZone: string): CalendarDigest {
  const baseUrl = getBaseUrl();
  const top = items.slice(0, 3);
  const bullets = top.length
    ? top.map((item) => `• ${item.title} (${formatDate(item.date, timeZone)})`).join("\n")
    : "• No major releases in the next 10 days.";

  return {
    title: "Calendar Assistant: Next up",
    body: `Here is your spoiler-free release radar:\n${bullets}`,
    link: `${baseUrl}/calendar-assistant`,
    metadata: {
      items: top,
      generatedAt: new Date().toISOString(),
      windowDays: 10,
    },
  };
}

async function sendViaEndpoints(userId: number, digest: CalendarDigest) {
  const endpoints = await listNotificationEndpointsForUser(userId);
  for (const endpoint of endpoints) {
    try {
      if (endpoint.type === "telegram") {
        const cfg = endpoint.config as TelegramConfig;
        const botToken = String(cfg?.botToken ?? "").trim();
        const chatId = String(cfg?.chatId ?? "").trim();
        if (!botToken || !chatId) continue;
        await sendTelegramMessage({ botToken, chatId, text: `🗓 ${digest.title}\n\n${digest.body}` });
        continue;
      }

      if (endpoint.type === "discord") {
        const cfg = endpoint.config as DiscordConfig;
        const webhookUrl = String(cfg?.webhookUrl ?? "").trim();
        if (!webhookUrl) continue;
        await sendDiscordWebhook({ webhookUrl, content: `🗓 **${digest.title}**\n${digest.body}` });
        continue;
      }

      if (endpoint.type === "email") {
        const cfg = endpoint.config as EmailConfig;
        const to = String(cfg?.to ?? "").trim();
        if (!to) continue;
        await sendEmail({
          to,
          subject: `[LeMedia] ${digest.title}`,
          text: `${digest.body}\n\nOpen: ${digest.link}`,
          html: `<p>${digest.body.replace(/\n/g, "<br />")}</p><p><a href="${digest.link}">Open Calendar Assistant</a></p>`,
          smtp: cfg,
        });
        continue;
      }

      if (endpoint.type === "webhook") {
        const cfg = endpoint.config as WebhookConfig;
        const url = String(cfg?.url ?? "").trim();
        if (!url) continue;
        await sendGenericWebhook({
          url,
          body: {
            event: "calendar_assistant",
            title: digest.title,
            message: digest.body,
            link: digest.link,
            metadata: digest.metadata,
          },
        });
      }
    } catch (error) {
      logger.warn("[calendar-assistant] endpoint delivery failed", {
        userId,
        endpointType: endpoint.type,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function sendCalendarAssistantToUser(userId: number, channels: string[]): Promise<void> {
  const timeZone = await resolveTimezone();
  const upcomingItems = await loadUpcomingItems(timeZone);
  const digest = buildDigest(upcomingItems, timeZone);
  const channelSet = parseChannels(channels.join(","));

  if (channelSet.has("in_app")) {
    await createNotification({
      userId,
      type: "calendar_assistant",
      title: digest.title,
      message: digest.body,
          link: "/calendar-assistant",
      metadata: digest.metadata,
    });
  }

  if (channelSet.has("endpoints")) {
    await sendViaEndpoints(userId, digest);
  }

  if (channelSet.has("telegram")) {
    const telegram = await getTelegramUserByUserId(userId);
    const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
    if (telegram?.telegram_id && botToken) {
      await sendTelegramMessage({
        botToken,
        chatId: telegram.telegram_id,
        text: `🗓 ${digest.title}\n\n${digest.body}`,
      });
    }
  }
}

export async function sendCalendarAssistantJob(): Promise<string> {
  const timeZone = await resolveTimezone();
  const now = new Date();
  const nowParts = getDateTimePartsInTimeZone(now.getTime(), timeZone);
  const localIso = getIsoDateInTimeZone(now.getTime(), timeZone);
  const localWeekday = new Date(`${localIso}T12:00:00Z`).getUTCDay();

  const recipients = await listCalendarAssistantRecipients();
  const due = recipients.filter((recipient) => {
    if (!recipient.enabled) return false;
    if (recipient.dayOfWeek !== localWeekday) return false;
    if (recipient.hourOfDay !== nowParts.hour) return false;
    return recipient.lastSentDate !== localIso;
  });

  if (!due.length) {
    return `no users due (tz=${timeZone})`;
  }

  const upcomingItems = await loadUpcomingItems(timeZone);
  const digest = buildDigest(upcomingItems, timeZone);

  let sent = 0;
  let failed = 0;

  for (const user of due) {
    const channels = parseChannels(user.channels);
    try {
      if (channels.has("in_app")) {
        await createNotification({
          userId: user.userId,
          type: "calendar_assistant",
          title: digest.title,
          message: digest.body,
          link: "/calendar-assistant",
          metadata: digest.metadata,
        });
      }

      if (channels.has("endpoints")) {
        await sendViaEndpoints(user.userId, digest);
      }

      if (channels.has("telegram")) {
        const telegram = await getTelegramUserByUserId(user.userId);
        const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
        if (telegram?.telegram_id && botToken) {
          await sendTelegramMessage({
            botToken,
            chatId: telegram.telegram_id,
            text: `🗓 ${digest.title}\n\n${digest.body}`,
          });
        }
      }

      await markCalendarAssistantSentDate(user.userId, localIso);
      sent += 1;
    } catch (error) {
      failed += 1;
      logger.error("[calendar-assistant] failed to send digest", {
        userId: user.userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return `due=${due.length} sent=${sent} failed=${failed} tz=${timeZone}`;
}
