/** A stable id for this browser/PWA install, kept in localStorage.
 *
 *  Used only for push subscriptions: when the browser replaces its push endpoint the new one
 *  carries the same id, so the server can drop the old endpoint instead of delivering every
 *  alert to both. It contains no personal data and is never used for analytics.
 */
const KEY = 'lemedia.push.device';
const VALID = /^[A-Za-z0-9_-]{8,64}$/;

export function getDeviceId(): string {
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && VALID.test(existing)) return existing;
    const raw = globalThis.crypto?.randomUUID?.()
      ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const id = raw.replaceAll(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    // Private mode / storage disabled: push still works, it just can't be de-duplicated.
    return '';
  }
}
