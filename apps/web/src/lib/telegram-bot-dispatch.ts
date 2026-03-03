import "server-only";

import { createClient } from "redis";
import { logger } from "@/lib/logger";

export type TelegramBotOutboxMessage = {
  chatId: string;
  text: string;
  parseMode?: "HTML" | "MarkdownV2";
};

const QUEUE_KEY = "lemedia:bot:outbox";

type GlobalRedisStore = typeof globalThis & {
  __lemediaBotDispatchRedisClient?: any;
  __lemediaBotDispatchRedisConnectPromise?: Promise<any | null>;
};

const globalStore = globalThis as GlobalRedisStore;
const redisUrl = process.env.REDIS_URL?.trim();

async function getRedisClient(): Promise<any | null> {
  if (!redisUrl) return null;

  const existing = globalStore.__lemediaBotDispatchRedisClient;
  if (existing?.isOpen) return existing;

  if (!globalStore.__lemediaBotDispatchRedisConnectPromise) {
    const client = createClient({ url: redisUrl });
    client.on("error", (error: unknown) => {
      logger.warn("[BotDispatch] Redis client error", {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    globalStore.__lemediaBotDispatchRedisConnectPromise = client
      .connect()
      .then(() => {
        globalStore.__lemediaBotDispatchRedisClient = client;
        return client;
      })
      .catch((error: unknown) => {
        logger.warn("[BotDispatch] Redis unavailable", {
          error: error instanceof Error ? error.message : String(error),
        });
        return null;
      })
      .finally(() => {
        globalStore.__lemediaBotDispatchRedisConnectPromise = undefined;
      });
  }

  return globalStore.__lemediaBotDispatchRedisConnectPromise;
}

export async function enqueueTelegramBotMessages(messages: TelegramBotOutboxMessage[]): Promise<number> {
  const cleaned = messages
    .map((message) => ({
      chatId: String(message.chatId ?? "").trim(),
      text: String(message.text ?? "").trim(),
      parseMode: message.parseMode,
    }))
    .filter((message) => message.chatId && message.text);

  if (cleaned.length === 0) return 0;

  const client = await getRedisClient();
  if (!client) return 0;

  try {
    await client.rPush(
      QUEUE_KEY,
      cleaned.map((message) => JSON.stringify(message))
    );
    return cleaned.length;
  } catch (error) {
    logger.warn("[BotDispatch] Failed to enqueue Telegram messages", {
      error: error instanceof Error ? error.message : String(error),
      count: cleaned.length,
    });
    return 0;
  }
}
