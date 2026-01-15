import "server-only";
import axios from "axios";
import rateLimit from "axios-rate-limit";
import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type NodeCache from "node-cache";
import { randomBytes, timingSafeEqual } from "crypto";
import { decryptSecret, encryptSecret } from "@/lib/encryption";
import { getSetting, setSetting } from "@/db";
import { requestInterceptorFunction } from "@/lib/custom-proxy-agent";

// 5 minute default TTL (in seconds)
const DEFAULT_TTL = 300;

// 10 seconds default rolling buffer (in ms)
const DEFAULT_ROLLING_BUFFER = 10000;

interface ExternalAPIOptions {
  nodeCache?: NodeCache;
  headers?: Record<string, unknown>;
  rateLimit?: {
    maxRPS: number;
    maxRequests: number;
  };
}

class ExternalAPI {
  protected axios: AxiosInstance;
  private baseUrl: string;
  private cache?: NodeCache;

  constructor(
    baseUrl: string,
    params: Record<string, unknown>,
    options: ExternalAPIOptions = {}
  ) {
    this.axios = axios.create({
      baseURL: baseUrl,
      params,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...options.headers,
      },
    });
    if (options.rateLimit) {
      this.axios = rateLimit(this.axios, {
        maxRequests: options.rateLimit.maxRequests,
        maxRPS: options.rateLimit.maxRPS,
      });
    }
    this.axios.interceptors.request.use(requestInterceptorFunction);

    this.baseUrl = baseUrl;
    this.cache = options.nodeCache;
  }

  protected async get<T>(
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl?: number
  ): Promise<T> {
    const cacheKey = this.serializeCacheKey(endpoint, {
      ...config?.params,
      headers: config?.headers,
    });
    const cachedItem = this.cache?.get<T>(cacheKey);
    if (cachedItem) {
      return cachedItem;
    }

    const response = await this.axios.get<T>(endpoint, config);

    if (this.cache && ttl !== 0) {
      this.cache.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
    }

    return response.data;
  }

  protected async getRolling<T>(
    endpoint: string,
    config?: AxiosRequestConfig,
    ttl?: number
  ): Promise<T> {
    const cacheKey = this.serializeCacheKey(endpoint, {
      ...config?.params,
      headers: config?.headers,
    });
    const cachedItem = this.cache?.get<T>(cacheKey);

    if (cachedItem) {
      const keyTtl = this.cache?.getTtl(cacheKey) ?? 0;
      if (
        keyTtl - (ttl ?? DEFAULT_TTL) * 1000 <
        Date.now() - DEFAULT_ROLLING_BUFFER
      ) {
        this.axios.get<T>(endpoint, config).then((response) => {
          this.cache?.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
        });
      }
      return cachedItem;
    }

    const response = await this.axios.get<T>(endpoint, config);

    if (this.cache && ttl !== 0) {
      this.cache.set(cacheKey, response.data, ttl ?? DEFAULT_TTL);
    }

    return response.data;
  }

  protected removeCache(endpoint: string, options?: Record<string, unknown>) {
    const cacheKey = this.serializeCacheKey(endpoint, {
      ...options,
    });
    this.cache?.del(cacheKey);
  }

  private serializeCacheKey(
    endpoint: string,
    options?: Record<string, unknown>
  ) {
    if (!options) {
      return `${this.baseUrl}${endpoint}`;
    }

    return `${this.baseUrl}${endpoint}${JSON.stringify(options)}`;
  }
}

export default ExternalAPI;

const EXTERNAL_API_KEY_SETTING = "external_api_key";

export function generateExternalApiKey() {
  return randomBytes(32).toString("hex");
}

export async function getExternalApiKey(): Promise<string | null> {
  const raw = await getSetting(EXTERNAL_API_KEY_SETTING);
  if (!raw) return null;
  try {
    return decryptSecret(raw);
  } catch {
    return raw;
  }
}

export async function setExternalApiKey(apiKey: string): Promise<void> {
  const encrypted = encryptSecret(apiKey);
  await setSetting(EXTERNAL_API_KEY_SETTING, encrypted);
}

export async function verifyExternalApiKey(apiKey: string): Promise<boolean> {
  const stored = await getExternalApiKey();
  if (!stored) return false;
  if (stored.length !== apiKey.length) return false;
  return timingSafeEqual(Buffer.from(stored, "utf8"), Buffer.from(apiKey, "utf8"));
}
