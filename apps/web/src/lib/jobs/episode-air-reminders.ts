import {
  cleanupEpisodeAirReminderSent,
  createNotification,
  listEpisodeAirReminderTelegramTargets,
  listTrackedTvForEpisodeReminders,
  markEpisodeAirReminderSent,
} from "@/db";
import { logger } from "@/lib/logger";
import { getTv, getTvSeason } from "@/lib/tmdb";
import { notifyUserPushEvent } from "@/notifications/push-events";
import { sendTelegramMessage } from "@/notifications/telegram";
import { getAppTimezone, isValidTimeZone } from "@/lib/app-timezone";

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

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_EPISODE_TIMEZONE = "Europe/London";

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

function getDateTimePartsInTimeZone(utcMs: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(utcMs));

  const byType = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(byType.get("year")),
    month: Number(byType.get("month")),
    day: Number(byType.get("day")),
    hour: Number(byType.get("hour")),
    minute: Number(byType.get("minute")),
    second: Number(byType.get("second")),
  };
}

function getTimeZoneOffsetMsAtUtc(utcMs: number, timeZone: string) {
  const parts = getDateTimePartsInTimeZone(utcMs, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - utcMs;
}

function toUtcMsFromLocalDateTime(
  dateIso: string,
  hourLocal: number,
  minuteLocal: number,
  timeZone: string
): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (!match) return Number.NaN;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcGuess = Date.UTC(year, month - 1, day, hourLocal, minuteLocal, 0);

  const offset1 = getTimeZoneOffsetMsAtUtc(utcGuess, timeZone);
  if (!Number.isFinite(offset1)) return Number.NaN;
  let utcMs = utcGuess - offset1;

  const offset2 = getTimeZoneOffsetMsAtUtc(utcMs, timeZone);
  if (Number.isFinite(offset2) && offset2 !== offset1) {
    utcMs = utcGuess - offset2;
  }

  return utcMs;
}

function toDateStringInTimeZone(utcMs: number, timeZone: string) {
  const parts = getDateTimePartsInTimeZone(utcMs, timeZone);
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function getLeadHours(): number {
  const raw = Number(process.env.EPISODE_AIR_REMINDER_HOURS ?? "6");
  if (!Number.isFinite(raw)) return 6;
  return Math.min(Math.max(Math.floor(raw), 1), 48);
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
  const leadHours = getLeadHours();
  const maxShowsPerUser = getMaxShowsPerUser();
  const timeZone = await getEpisodeReminderTimezone();
  const anchorHourLocal = getAirAnchorHourLocal();
  const anchorMinuteLocal = getAirAnchorMinuteLocal();
  const windowStartMs = Date.now();
  const windowEndMs = windowStartMs + leadHours * 60 * 60 * 1000;

  const tracked = await listTrackedTvForEpisodeReminders(maxShowsPerUser);
  if (!tracked.length) {
    await cleanupEpisodeAirReminderSent(60).catch(() => {});
    return "no tracked TV shows";
  }

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

  const pendingByUser = new Map<number, UpcomingEpisode[]>();

  for (const row of tracked) {
    const upcoming = showUpcomingMap.get(row.tmdbId) ?? [];
    if (!upcoming.length) continue;

    for (const episode of upcoming) {
      const shouldSend = await markEpisodeAirReminderSent({
        userId: row.userId,
        tmdbId: episode.tmdbId,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        airDate: episode.airDate,
      });

      if (!shouldSend) continue;

      if (!pendingByUser.has(row.userId)) {
        pendingByUser.set(row.userId, []);
      }
      pendingByUser.get(row.userId)!.push(episode);
    }
  }

  if (!pendingByUser.size) {
    await cleanupEpisodeAirReminderSent(60).catch(() => {});
    return `tracked=${tracked.length} shows=${uniqueShowIds.length} reminders=0`;
  }

  const reminderUserIds = Array.from(pendingByUser.keys());
  const telegramTargets = await listEpisodeAirReminderTelegramTargets(reminderUserIds);
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

  let sent = 0;
  let failed = 0;
  let telegramSent = 0;
  let pushSent = 0;

  for (const [userId, episodes] of pendingByUser.entries()) {
    const target = telegramTargets.get(userId) ?? {
      telegramId: null,
      telegramFollowOptIn: false,
    };

    for (const episode of episodes) {
      const airMoment = formatAirMoment(episode.airAtMs, timeZone);
      const episodeCode = formatEpisodeCode(episode.seasonNumber, episode.episodeNumber);
      const title = `${episode.seriesName} ${episodeCode} airs soon`;
      const body = `${episode.episodeName} is expected around ${airMoment}.`;
      const link = `/tv/${episode.tmdbId}`;

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
          },
        });

        await notifyUserPushEvent(userId, {
          title,
          body,
          tag: `episode-air-${episode.tmdbId}-${episode.seasonNumber}-${episode.episodeNumber}`,
          url: link,
        });
        pushSent += 1;

        if (botToken && target.telegramId && target.telegramFollowOptIn) {
          await sendTelegramMessage({
            botToken,
            chatId: target.telegramId,
            text: `📺 ${title}\n${body}`,
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

  return `tracked=${tracked.length} shows=${uniqueShowIds.length} reminders=${sent} failed=${failed} push=${pushSent} telegram=${telegramSent} showErrors=${showErrors} tz=${timeZone}`;
}
