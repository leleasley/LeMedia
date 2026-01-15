import { EventEmitter } from "events";

/**
 * AsyncLock - Prevents race conditions when multiple requests try to create/modify the same media
 * 
 * Based on Seerr's implementation. Ensures only one operation per media ID can run at a time.
 * This prevents duplicate request creation and database constraint errors.
 * 
 * Usage:
 *   await asyncLock.dispatch(mediaId, async () => {
 *     // Check for existing request
 *     // Create new request
 *   });
 */
class AsyncLock {
  private locked: { [key: string]: boolean } = {};
  private ee = new EventEmitter();

  constructor() {
    this.ee.setMaxListeners(0); // Allow unlimited listeners
  }

  private acquire = async (key: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!this.locked[key]) {
        this.locked[key] = true;
        return resolve(undefined);
      }

      const nextAcquire = () => {
        if (!this.locked[key]) {
          this.locked[key] = true;
          this.ee.removeListener(key, nextAcquire);
          return resolve(undefined);
        }
      };

      this.ee.on(key, nextAcquire);
    });
  };

  private release = (key: string): void => {
    delete this.locked[key];
    setImmediate(() => this.ee.emit(key));
  };

  /**
   * Execute a callback with exclusive lock on the given key
   * @param key - The unique identifier (e.g., tmdb_id) to lock on
   * @param callback - The async function to execute exclusively
   */
  public dispatch = async (
    key: string | number,
    callback: () => Promise<void>
  ): Promise<void> => {
    const skey = String(key);
    await this.acquire(skey);
    try {
      await callback();
    } finally {
      this.release(skey);
    }
  };
}

const asyncLock = new AsyncLock();
export default asyncLock;
