import { notificationRegistry } from '../notifications/index.js';
import { sendUserNotification as _sendUserNotification } from '../services/userNotifications.js';
import { getAppSettings, parseInstanceLanguages } from './appSettings.js';
import { pluginEventBus } from '../plugins/eventBus.js';
import { logEvent } from './logEvent.js';
import { sendPushToUsers } from '../services/pushService.js';
import type { PluginUserNotificationCreatedV1, NotificationLocale } from '@lemedia/shared';
import { renderNotificationTemplate, toNotificationLocale } from '@lemedia/shared';

let _siteUrl: string | null = null;
let _siteUrlFetched = false;
let _instanceLang: string | null = null;
let _instanceLangFetched = false;

/** Get the configured site URL (cached) */
export async function getSiteUrl(): Promise<string | null> {
  if (_siteUrlFetched) return _siteUrl;
  const settings = await getAppSettings();
  _siteUrl = settings?.siteUrl || process.env.FRONTEND_URL || null;
  _siteUrlFetched = true;
  return _siteUrl;
}

/** Invalidate cached site URL + instance language (call after settings update) */
export function invalidateSiteUrl(): void {
  _siteUrlFetched = false;
  _instanceLangFetched = false;
}

/** Build a full URL from a path (e.g. /movie/123) */
export async function buildSiteLink(path: string): Promise<string | undefined> {
  const base = await getSiteUrl();
  if (!base) return undefined;
  return `${base.replace(/\/$/, '')}${path}`;
}

/** Resolve the first language in AppSettings.instanceLanguages, cached like siteUrl. */
async function getInstanceLanguage(): Promise<string> {
  if (_instanceLangFetched && _instanceLang) return _instanceLang;
  try {
    const settings = await getAppSettings();
    _instanceLang = parseInstanceLanguages(settings?.instanceLanguages)[0];
  } catch {
    _instanceLang = 'en';
  }
  _instanceLangFetched = true;
  return _instanceLang;
}

/** Instance language as a notification locale — the single entry point backend senders (push
 *  fan-out, channel registry) use to resolve the broadcast language. */
export async function getInstanceLocale(): Promise<NotificationLocale> {
  return toNotificationLocale(await getInstanceLanguage());
}

/** Render `notifications.*` keys via the shared template table; pass through literals. */
function translateNotif(value: string, lang: string, params: Record<string, unknown>): string {
  if (!value.startsWith('notifications.')) return value;
  return renderNotificationTemplate(value, toNotificationLocale(lang), params);
}

/** Fire-and-forget notification — logs errors without crashing */
export function safeNotify(type: string, data: Parameters<typeof notificationRegistry.send>[1]): void {
  notificationRegistry.send(type, data).catch(err => logEvent('error', 'Notification', `safeNotify(${type}) failed: ${String(err)}`));
}

/** Fire-and-forget user notification — also fans out a `user.notification.created` event on
 *  the plugin bus pre-translated against the instance language. */
export function safeUserNotify(userId: number, payload: Parameters<typeof _sendUserNotification>[1]): void {
  _sendUserNotification(userId, payload).catch(err => logEvent('error', 'UserNotification', `safeUserNotify(${payload.type}) failed: ${String(err)}`));

  // Resolve the language + interpolate keys before emitting. Async, but we're already in a
  // fire-and-forget surface — chaining `.then` keeps the caller signature unchanged.
  getInstanceLanguage().then((lang) => {
    const params = ((payload.metadata as { msgParams?: Record<string, unknown> } | undefined)?.msgParams) ?? {};
    const event: PluginUserNotificationCreatedV1 = {
      v: 1,
      userId,
      type: payload.type,
      title: payload.title,
      titleText: translateNotif(payload.title, lang, params),
      message: payload.message,
      messageText: translateNotif(payload.message, lang, params),
      metadata: payload.metadata ?? {},
      createdAt: new Date().toISOString(),
    };
    // Phone/web push for request decisions (media_available pushes are sent by the sync
    // helpers, which also handle digests — don't double up here).
    if (payload.type === 'request_approved' || payload.type === 'request_declined') {
      const meta = (payload.metadata ?? {}) as { tmdbId?: number; mediaType?: string };
      const url = meta.tmdbId && meta.tmdbId > 0 && meta.mediaType ? `/${meta.mediaType}/${meta.tmdbId}` : '/requests';
      const locale = toNotificationLocale(lang);
      const typeLabel = renderNotificationTemplate(meta.mediaType === 'tv' ? 'notifications.type.tv' : 'notifications.type.movie', locale, {});
      sendPushToUsers([userId], {
        title: renderNotificationTemplate(`notifications.push.${payload.type}.title`, locale, { ...params, type: typeLabel }),
        body: renderNotificationTemplate(`notifications.push.${payload.type}.body`, locale, params),
        url,
      }, payload.type).catch((err) => logEvent('warn', 'WebPush', `push for ${payload.type} failed: ${String(err)}`));
    }
    return pluginEventBus.emit('user.notification.created', event);
  }).catch(err => {
    logEvent('error', 'PluginEvent', `Subscriber of 'user.notification.created' threw: ${String(err)}`);
  });
}
