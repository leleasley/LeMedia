import { NextRequest, NextResponse } from "next/server";
import { createClient } from "redis";
import { logger } from "@/lib/logger";

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
  __lemediaRedisClient?: any;
  __lemediaRedisConnectPromise?: Promise<any | null>;
  __lemediaRedisUnavailableUntil?: number;
};

const rateLimits = globalStore.__lemediaRateLimits ?? new Map<string, RateLimitEntry>();
const lockouts = globalStore.__lemediaLockouts ?? new Map<string, RateLimitEntry>();
globalStore.__lemediaRateLimits = rateLimits;
globalStore.__lemediaLockouts = lockouts;

const redisUrl = process.env.REDIS_URL?.trim();

function nowMs() {
  return Date.now();
}

function markRedisUnavailable(ms: number) {
  globalStore.__lemediaRedisUnavailableUntil = nowMs() + ms;
}

function shouldSkipRedis() {
  const unavailableUntil = globalStore.__lemediaRedisUnavailableUntil ?? 0;
  return unavailableUntil > nowMs();
}

function handleRedisError(context: string, error: unknown) {
  logger.warn(`[RateLimit] Redis fallback (${context})`, {
    error: error instanceof Error ? error.message : String(error)
  });
  markRedisUnavailable(30_000);
}

async function getRedisClient(): Promise<any | null> {
  if (!redisUrl || shouldSkipRedis()) return null;

  const existing = globalStore.__lemediaRedisClient;
  if (existing?.isOpen) return existing;

  if (!globalStore.__lemediaRedisConnectPromise) {
    const client = createClient({ url: redisUrl });
    client.on("error", (error) => {
      handleRedisError("client-error", error);
    });

    globalStore.__lemediaRedisConnectPromise = client.connect()
      .then(() => {
        globalStore.__lemediaRedisClient = client;
        globalStore.__lemediaRedisUnavailableUntil = 0;
        return client;
      })
      .catch((error) => {
        handleRedisError("connect", error);
        return null;
      })
      .finally(() => {
        globalStore.__lemediaRedisConnectPromise = undefined;
      });
  }

  return await globalStore.__lemediaRedisConnectPromise;
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

export async function checkRateLimit(key: string, opts: RateLimitOptions): Promise<RateLimitResult> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const redisKey = `rl:${key}`;
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.pExpire(redisKey, opts.windowMs);
      }

      let ttl = await redis.pTTL(redisKey);
      if (ttl < 0) {
        await redis.pExpire(redisKey, opts.windowMs);
        ttl = opts.windowMs;
      }

      if (count > opts.max) {
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil(ttl / 1000)) };
      }
      return { ok: true };
    } catch (error) {
      handleRedisError("check-rate", error);
    }
  }

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

export async function checkLockout(key: string, opts: LockoutOptions): Promise<LockoutResult> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const banKey = `lb:${key}`;
      let ttl = await redis.pTTL(banKey);
      if (ttl > 0) {
        return { locked: true, retryAfterSec: Math.max(1, Math.ceil(ttl / 1000)) };
      }

      if (ttl === -1) {
        await redis.pExpire(banKey, opts.banMs);
        return { locked: true, retryAfterSec: Math.max(1, Math.ceil(opts.banMs / 1000)) };
      }

      return { locked: false };
    } catch (error) {
      handleRedisError("check-lockout", error);
    }
  }

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

export async function recordFailure(key: string, opts: LockoutOptions): Promise<LockoutResult> {
  const redis = await getRedisClient();
  if (redis) {
    try {
      const failKey = `lf:${key}`;
      const banKey = `lb:${key}`;

      let banTtl = await redis.pTTL(banKey);
      if (banTtl > 0) {
        return { locked: true, retryAfterSec: Math.max(1, Math.ceil(banTtl / 1000)) };
      }
      if (banTtl === -1) {
        await redis.pExpire(banKey, opts.banMs);
        banTtl = opts.banMs;
        return { locked: true, retryAfterSec: Math.max(1, Math.ceil(banTtl / 1000)) };
      }

      const count = await redis.incr(failKey);
      if (count === 1) {
        await redis.pExpire(failKey, opts.windowMs);
      }

      if (count >= opts.max) {
        await redis.set(banKey, "1", { PX: opts.banMs });
        await redis.del(failKey);
        return { locked: true, retryAfterSec: Math.max(1, Math.ceil(opts.banMs / 1000)) };
      }

      return { locked: false };
    } catch (error) {
      handleRedisError("record-failure", error);
    }
  }

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

export async function clearFailures(key: string) {
  const redis = await getRedisClient();
  if (redis) {
    try {
      await redis.del(`lf:${key}`, `lb:${key}`);
      return;
    } catch (error) {
      handleRedisError("clear-failures", error);
    }
  }
  lockouts.delete(key);
}

export function rateLimitResponse(retryAfterSec: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

export async function enforceRateLimit(req: NextRequest, keyPrefix: string, opts: RateLimitOptions) {
  const ip = getClientIp(req);
  const rate = await checkRateLimit(`${keyPrefix}:${ip}`, opts);
  if (!rate.ok) return rateLimitResponse(rate.retryAfterSec);
  return null;
}
