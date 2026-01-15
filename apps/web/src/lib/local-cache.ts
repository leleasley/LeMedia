import "server-only";

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const MAX_ENTRIES = 500;
const store = new Map<string, CacheEntry<unknown>>();

function touchKey(key: string, entry: CacheEntry<unknown>) {
  store.delete(key);
  store.set(key, entry);
}

function enforceSizeLimit() {
  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value as string | undefined;
    if (!oldestKey) return;
    store.delete(oldestKey);
  }
}

export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  touchKey(key, entry);
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  enforceSizeLimit();
}

export async function withCache<T>(key: string, ttlMs: number, loader: () => Promise<T>) {
  const cached = getCached<T>(key);
  if (cached !== undefined) return cached;
  const value = await loader();
  setCached(key, value, ttlMs);
  return value;
}
