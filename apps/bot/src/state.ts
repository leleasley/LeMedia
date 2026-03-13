import Redis from "ioredis";
import type { SearchResult, TrendingItem } from "./api";

export type LastSelectedMedia = {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  year: number | null;
  available: boolean;
  requestStatus: string | null;
};

export type AwaitingReleaseMode = "all" | "digital";

export type PendingReleaseSearch = {
  mode: AwaitingReleaseMode;
  results: SearchResult[];
};

export type BotOutboxMessage = {
  chatId: string;
  text: string;
  parseMode?: "HTML" | "MarkdownV2";
};

let redis: Redis | null = null;

const REDIS_URL = process.env.REDIS_URL ?? "redis://lemedia-redis:6379";

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableOfflineQueue: true,
    });
  }
  return redis;
}

function keyAwaitingQuery(telegramId: string) {
  return `lemedia:bot:awaiting_query:${telegramId}`;
}

function keyPendingSearch(chatId: number) {
  return `lemedia:bot:pending_search:${chatId}`;
}

function keyPendingTrending(chatId: number) {
  return `lemedia:bot:pending_trending:${chatId}`;
}

function keyPendingWatchSearch(chatId: number) {
  return `lemedia:bot:pending_watch_search:${chatId}`;
}

function keyPendingFollowSearch(chatId: number) {
  return `lemedia:bot:pending_follow_search:${chatId}`;
}

function keyAwaitingWatchQuery(telegramId: string) {
  return `lemedia:bot:awaiting_watch_query:${telegramId}`;
}

function keyAwaitingReleaseQuery(telegramId: string) {
  return `lemedia:bot:awaiting_release_query:${telegramId}`;
}

function keyLastSelected(chatId: number) {
  return `lemedia:bot:last_selected:${chatId}`;
}

function keyPendingReleaseSearch(chatId: number) {
  return `lemedia:bot:pending_release_search:${chatId}`;
}

function keyDigestSent(dateKey: string) {
  return `lemedia:bot:digest_sent:${dateKey}`;
}

function keyBotOutbox() {
  return "lemedia:bot:outbox";
}

function keyBotOutboxProcessing() {
  return "lemedia:bot:outbox:processing";
}

const SESSION_TTL_SECONDS = 60 * 20;

export async function ensureStateReady(): Promise<void> {
  const client = getRedis();
  await client.ping();
}

export async function setAwaitingQuery(telegramId: string): Promise<void> {
  const client = getRedis();
  await client.set(keyAwaitingQuery(telegramId), "1", "EX", SESSION_TTL_SECONDS);
}

export async function consumeAwaitingQuery(telegramId: string): Promise<boolean> {
  const client = getRedis();
  const key = keyAwaitingQuery(telegramId);
  const exists = await client.get(key);
  if (!exists) return false;
  await client.del(key);
  return true;
}

export async function setPendingSearch(chatId: number, results: SearchResult[]): Promise<void> {
  const client = getRedis();
  await client.set(keyPendingSearch(chatId), JSON.stringify(results), "EX", SESSION_TTL_SECONDS);
}

export async function getPendingSearch(chatId: number): Promise<SearchResult[] | null> {
  const client = getRedis();
  const raw = await client.get(keyPendingSearch(chatId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SearchResult[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPendingSearch(chatId: number): Promise<void> {
  const client = getRedis();
  await client.del(keyPendingSearch(chatId));
}

export async function setPendingTrending(chatId: number, items: TrendingItem[]): Promise<void> {
  const client = getRedis();
  await client.set(keyPendingTrending(chatId), JSON.stringify(items), "EX", SESSION_TTL_SECONDS);
}

export async function getPendingTrending(chatId: number): Promise<TrendingItem[] | null> {
  const client = getRedis();
  const raw = await client.get(keyPendingTrending(chatId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TrendingItem[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPendingTrending(chatId: number): Promise<void> {
  const client = getRedis();
  await client.del(keyPendingTrending(chatId));
}

export async function setPendingWatchSearch(chatId: number, results: SearchResult[]): Promise<void> {
  const client = getRedis();
  await client.set(keyPendingWatchSearch(chatId), JSON.stringify(results), "EX", SESSION_TTL_SECONDS);
}

export async function getPendingWatchSearch(chatId: number): Promise<SearchResult[] | null> {
  const client = getRedis();
  const raw = await client.get(keyPendingWatchSearch(chatId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SearchResult[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPendingWatchSearch(chatId: number): Promise<void> {
  const client = getRedis();
  await client.del(keyPendingWatchSearch(chatId));
}

export async function setPendingFollowSearch(chatId: number, results: SearchResult[]): Promise<void> {
  const client = getRedis();
  await client.set(keyPendingFollowSearch(chatId), JSON.stringify(results), "EX", SESSION_TTL_SECONDS);
}

export async function getPendingFollowSearch(chatId: number): Promise<SearchResult[] | null> {
  const client = getRedis();
  const raw = await client.get(keyPendingFollowSearch(chatId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SearchResult[];
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function clearPendingFollowSearch(chatId: number): Promise<void> {
  const client = getRedis();
  await client.del(keyPendingFollowSearch(chatId));
}

export async function setAwaitingWatchQuery(telegramId: string): Promise<void> {
  const client = getRedis();
  await client.set(keyAwaitingWatchQuery(telegramId), "1", "EX", SESSION_TTL_SECONDS);
}

export async function consumeAwaitingWatchQuery(telegramId: string): Promise<boolean> {
  const client = getRedis();
  const key = keyAwaitingWatchQuery(telegramId);
  const exists = await client.get(key);
  if (!exists) return false;
  await client.del(key);
  return true;
}

export async function setAwaitingReleaseQuery(telegramId: string, mode: AwaitingReleaseMode): Promise<void> {
  const client = getRedis();
  await client.set(keyAwaitingReleaseQuery(telegramId), mode, "EX", SESSION_TTL_SECONDS);
}

export async function consumeAwaitingReleaseQuery(telegramId: string): Promise<AwaitingReleaseMode | null> {
  const client = getRedis();
  const key = keyAwaitingReleaseQuery(telegramId);
  const mode = await client.get(key);
  if (!mode) return null;
  await client.del(key);
  return mode === "digital" ? "digital" : "all";
}

export async function setLastSelected(chatId: number, media: LastSelectedMedia): Promise<void> {
  const client = getRedis();
  await client.set(keyLastSelected(chatId), JSON.stringify(media), "EX", SESSION_TTL_SECONDS);
}

export async function getLastSelected(chatId: number): Promise<LastSelectedMedia | null> {
  const client = getRedis();
  const raw = await client.get(keyLastSelected(chatId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LastSelectedMedia;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.id !== "number") return null;
    if (parsed.mediaType !== "movie" && parsed.mediaType !== "tv") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setPendingReleaseSearch(
  chatId: number,
  mode: AwaitingReleaseMode,
  results: SearchResult[]
): Promise<void> {
  const client = getRedis();
  const payload: PendingReleaseSearch = { mode, results };
  await client.set(keyPendingReleaseSearch(chatId), JSON.stringify(payload), "EX", SESSION_TTL_SECONDS);
}

export async function getPendingReleaseSearch(chatId: number): Promise<PendingReleaseSearch | null> {
  const client = getRedis();
  const raw = await client.get(keyPendingReleaseSearch(chatId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingReleaseSearch;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.mode !== "all" && parsed.mode !== "digital") return null;
    if (!Array.isArray(parsed.results)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingReleaseSearch(chatId: number): Promise<void> {
  const client = getRedis();
  await client.del(keyPendingReleaseSearch(chatId));
}

export async function closeState(): Promise<void> {
  if (!redis) return;
  await redis.quit();
  redis = null;
}

export async function markDigestSentForDate(dateKey: string): Promise<void> {
  const client = getRedis();
  await client.set(keyDigestSent(dateKey), "1", "EX", 60 * 60 * 36);
}

export async function isDigestSentForDate(dateKey: string): Promise<boolean> {
  const client = getRedis();
  const value = await client.get(keyDigestSent(dateKey));
  return value === "1";
}

export type LeasedBotOutboxMessage = BotOutboxMessage & {
  raw: string;
};

function parseBotOutboxMessage(raw: string): LeasedBotOutboxMessage | null {
  try {
    const parsed = JSON.parse(raw);
    const chatId = String(parsed?.chatId ?? "").trim();
    const text = String(parsed?.text ?? "").trim();
    const parseMode = parsed?.parseMode === "HTML" || parsed?.parseMode === "MarkdownV2" ? parsed.parseMode : undefined;
    if (!chatId || !text) return null;
    return { chatId, text, parseMode, raw };
  } catch {
    return null;
  }
}

export async function recoverBotOutboxLeases(): Promise<number> {
  const client = getRedis();
  let recovered = 0;

  while (true) {
    const raw = await client.lmove(keyBotOutboxProcessing(), keyBotOutbox(), "RIGHT", "LEFT");
    if (!raw) break;
    recovered += 1;
  }

  return recovered;
}

export async function leaseBotOutboxBatch(limit = 25): Promise<LeasedBotOutboxMessage[]> {
  const client = getRedis();
  const count = Math.max(1, Math.min(100, Math.floor(limit)));
  const values: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const raw = await client.lmove(keyBotOutbox(), keyBotOutboxProcessing(), "LEFT", "RIGHT");
    if (!raw) break;
    values.push(raw);
  }

  const out: LeasedBotOutboxMessage[] = [];
  for (const raw of values) {
    const parsed = parseBotOutboxMessage(raw);
    if (parsed) {
      out.push(parsed);
      continue;
    }

    await client.lrem(keyBotOutboxProcessing(), 1, raw);
  }

  return out;
}

export async function ackBotOutboxMessage(raw: string): Promise<void> {
  const client = getRedis();
  await client.lrem(keyBotOutboxProcessing(), 1, raw);
}

export async function requeueBotOutboxMessage(raw: string): Promise<void> {
  const client = getRedis();
  await client.multi()
    .lrem(keyBotOutboxProcessing(), 1, raw)
    .rpush(keyBotOutbox(), raw)
    .exec();
}
