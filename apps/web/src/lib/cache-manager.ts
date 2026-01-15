import NodeCache from "node-cache";

class CacheManager {
  private caches: Record<string, NodeCache> = {};

  getCache(name: string, options?: { stdTTL?: number; checkperiod?: number }): NodeCache {
    if (!this.caches[name]) {
      this.caches[name] = new NodeCache({
        stdTTL: options?.stdTTL ?? 300,
        checkperiod: options?.checkperiod ?? 120,
        useClones: false,
      });
    }
    return this.caches[name];
  }

  clearAll() {
    Object.values(this.caches).forEach(cache => cache.flushAll());
  }

  clear(name: string) {
    this.caches[name]?.flushAll();
  }
}

const cacheManager = new CacheManager();
export default cacheManager;
