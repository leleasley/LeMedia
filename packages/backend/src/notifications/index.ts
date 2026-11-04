import { notificationRegistry } from './registry.js';
import { discordProvider } from './providers/discord.js';
import { telegramProvider } from './providers/telegram.js';
import { emailProvider } from './providers/email.js';
import { logEvent } from '../utils/logEvent.js';
import type { NotificationEventType } from './types.js';

const CORE_EVENT_TYPES: NotificationEventType[] = [
  { key: 'request_new', label: 'New request', labelKey: 'admin.notifications.event.request_new', color: 0xf59e0b },
  { key: 'request_approved', label: 'Request approved', labelKey: 'admin.notifications.event.request_approved', color: 0x6366f1 },
  { key: 'request_declined', label: 'Request declined', labelKey: 'admin.notifications.event.request_declined', color: 0xef4444 },
  { key: 'media_available', label: 'Media available', labelKey: 'admin.notifications.event.media_available', color: 0x10b981 },
  { key: 'digital_release_discovered', label: 'Digital date found', labelKey: 'admin.notifications.event.digital_release_discovered', color: 0x8b5cf6 },
  { key: 'digital_release_day', label: 'Digital release day', labelKey: 'admin.notifications.event.digital_release_day', color: 0x06b6d4 },
  { key: 'incident_banner', label: 'Incident', labelKey: 'admin.notifications.event.incident_banner', color: 0xef4444 },
  { key: 'list_added', label: 'List added titles', labelKey: 'admin.notifications.event.list_added', color: 0x22c55e },
  { key: 'app_update', label: 'App update', labelKey: 'admin.notifications.event.app_update', color: 0x3b82f6 },
  { key: 'zurg_broken', label: 'Zurg broken releases', labelKey: 'admin.notifications.event.zurg_broken', color: 0xf97316 },
];

export function initNotifications(): void {
  // Register core providers
  notificationRegistry.registerProvider(discordProvider);
  notificationRegistry.registerProvider(telegramProvider);
  notificationRegistry.registerProvider(emailProvider);

  // Register core event types
  notificationRegistry.registerEventTypes(CORE_EVENT_TYPES);

  logEvent('debug', 'Notifications', 'Initialized with core providers: discord, telegram, email');
}

// Re-exports for convenience
export { notificationRegistry } from './registry.js';
export type { NotificationPayload, NotificationProvider, NotificationEventType, ProviderSettingField } from './types.js';
