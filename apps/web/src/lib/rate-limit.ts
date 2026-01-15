import { NextRequest, NextResponse } from "next/server";

type RateLimitEntry = {
  count: number;
  resetAt: number;
  bannedUntil?: number;
};

type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type LockoutOptions = {
  windowMs: number;
  max: number;
  banMs: number;
};

type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };
type LockoutResult = { locked: false } | { locked: true; retryAfterSec: number };

const globalStore = globalThis as typeof globalThis & {
  __lemediaRateLimits?: Map<string, RateLimitEntry>;
  __lemediaLockouts?: Map<string, RateLimitEntry>;
};

const rateLimits = globalStore.__lemediaRateLimits ?? new Map<string, RateLimitEntry>();
const lockouts = globalStore.__lemediaLockouts ?? new Map<string, RateLimitEntry>();
globalStore.__lemediaRateLimits = rateLimits;
globalStore.__lemediaLockouts = lockouts;

function nowMs() {
  return Date.now();
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

export function checkRateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = nowMs();
  const entry = rateLimits.get(key);
  if (!entry || entry.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { ok: true };
  }
  if (entry.count >= opts.max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  entry.count += 1;
  return { ok: true };
}

export function checkLockout(key: string, opts: LockoutOptions): LockoutResult {
  const now = nowMs();
  const entry = lockouts.get(key);
  if (!entry) return { locked: false };
  if (entry.bannedUntil && entry.bannedUntil > now) {
    return { locked: true, retryAfterSec: Math.max(1, Math.ceil((entry.bannedUntil - now) / 1000)) };
  }
  if (entry.resetAt <= now) {
    lockouts.delete(key);
    return { locked: false };
  }
  return { locked: false };
}

export function recordFailure(key: string, opts: LockoutOptions): LockoutResult {
  const now = nowMs();
  const entry = lockouts.get(key);
  if (!entry || entry.resetAt <= now) {
    lockouts.set(key, { count: 1, resetAt: now + opts.windowMs });
    return { locked: false };
  }
  entry.count += 1;
  if (entry.count >= opts.max) {
    entry.bannedUntil = now + opts.banMs;
    return { locked: true, retryAfterSec: Math.max(1, Math.ceil(opts.banMs / 1000)) };
  }
  return { locked: false };
}

export function clearFailures(key: string) {
  lockouts.delete(key);
}

export function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

export function enforceRateLimit(req: NextRequest, keyPrefix: string, opts: RateLimitOptions) {
  const ip = getClientIp(req);
  const rate = checkRateLimit(`${keyPrefix}:${ip}`, opts);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec);
  return null;
}
