import "server-only";

import { getSetting } from "@/db";

export const DEFAULT_APP_TIMEZONE = "Europe/London";

const CACHE_TTL_MS = 60_000;

type TimeZoneCache = {
  value: string;
  expiresAt: number;
};

const timezoneCacheStore = globalThis as typeof globalThis & {
  __lemediaAppTimezoneCache?: TimeZoneCache;
};

function normalizeTimeZoneCandidate(value?: string | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidTimeZone(value: string): boolean {
  const candidate = normalizeTimeZoneCandidate(value);
  if (!candidate) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: candidate }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export async function getAppTimezone(): Promise<string> {
  const cached = timezoneCacheStore.__lemediaAppTimezoneCache;
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  let storedAppTimezone: string | null = null;
  let storedJobsTimezone: string | null = null;
  try {
    [storedAppTimezone, storedJobsTimezone] = await Promise.all([
      getSetting("app.timezone"),
      getSetting("jobs.timezone"),
    ]);
  } catch {
    // Ignore settings lookup failures and fall back to environment/default.
  }

  const candidates = [
    storedAppTimezone,
    storedJobsTimezone,
    process.env.APP_TIMEZONE,
    process.env.JOBS_TIMEZONE,
    process.env.TZ,
    DEFAULT_APP_TIMEZONE,
  ]
    .map((value) => normalizeTimeZoneCandidate(value))
    .filter((value): value is string => !!value);

  const selected = candidates.find((candidate) => isValidTimeZone(candidate)) ?? DEFAULT_APP_TIMEZONE;

  timezoneCacheStore.__lemediaAppTimezoneCache = {
    value: selected,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return selected;
}

function formatToParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.get("year")),
    month: Number(map.get("month")),
    day: Number(map.get("day")),
  };
}

export function getIsoDateInTimeZone(dateInput: Date | number, timeZone: string): string {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const parts = formatToParts(date, timeZone);
  const year = String(parts.year).padStart(4, "0");
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeDateOnly(value?: string | null): string | null {
  if (!value) return null;
  const datePart = String(value).trim().split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;
  return datePart;
}

export function addDaysToIsoDate(isoDate: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const next = new Date(base + days * 24 * 60 * 60 * 1000);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function diffIsoDays(fromIsoDate: string, toIsoDate: string): number {
  const fromMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromIsoDate);
  const toMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toIsoDate);
  if (!fromMatch || !toMatch) return 0;

  const fromMs = Date.UTC(Number(fromMatch[1]), Number(fromMatch[2]) - 1, Number(fromMatch[3]));
  const toMs = Date.UTC(Number(toMatch[1]), Number(toMatch[2]) - 1, Number(toMatch[3]));
  return Math.round((toMs - fromMs) / (24 * 60 * 60 * 1000));
}
