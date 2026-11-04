import axios from 'axios';
import { renderNotificationTemplate, notifMediaLabel } from '@lemedia/shared';
import type { NotificationProvider, NotificationPayload } from '../types.js';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildCaption(payload: NotificationPayload): string {
  const locale = payload.language ?? 'en';
  if (payload.type === 'incident_banner') {
    return `<b>${escapeHtml(renderNotificationTemplate('notifications.event.incident_banner', locale))}</b>\n${escapeHtml(payload.message || '')}`;
  }
  const emoji = payload.type === 'media_available' ? '🎬' : payload.type === 'digital_release_day' ? '💿' : payload.type === 'digital_release_discovered' ? '📅' : payload.type === 'request_approved' ? '✅' : payload.type === 'request_new' ? '🆕' : payload.type === 'list_added' ? '📋' : payload.type === 'app_update' ? '⬆️' : payload.type === 'zurg_broken' ? '🧩' : '🔔';
  const mediaLabel = notifMediaLabel(payload.mediaType, locale);
  const mediaSuffix = mediaLabel ? ` (${escapeHtml(mediaLabel)})` : '';
  const title = `<b>${escapeHtml(payload.title || 'Unknown')}</b>`;
  const label = escapeHtml(payload.label ?? renderNotificationTemplate(`notifications.event.${payload.type}`, locale) ?? payload.type);
  let caption = `${emoji} <b>${label}</b>\n${title}${mediaSuffix}`;
  if (payload.username) caption += `\n👤 ${escapeHtml(payload.username)}`;
  if (payload.message) caption += `\n\n${escapeHtml(payload.message)}`;
  if (payload.type === 'media_available') caption += `\n\n✅ ${escapeHtml(renderNotificationTemplate('notifications.push.media_available.body', locale))}`;
  return caption;
}

function buildText(payload: NotificationPayload): string {
  // Fallback plain text for non-media types
  return buildCaption(payload).replace(/<[^>]+>/g, '');
}

export const telegramProvider: NotificationProvider = {
  id: 'telegram',
  nameKey: 'admin.notifications.provider.telegram',
  icon: 'Send',
  settingsSchema: [
    {
      key: 'botToken',
      labelKey: 'admin.notifications.provider.telegram.bot_token',
      type: 'password',
      placeholder: '123456:ABC-DEF...',
      required: true,
    },
    {
      key: 'chatId',
      labelKey: 'admin.notifications.provider.telegram.chat_id',
      type: 'text',
      placeholder: '-1001234567890',
      required: true,
    },
  ],

  async send(settings, payload) {
    const siteUrl = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const fullUrl = payload.url ? (payload.url.startsWith('http') ? payload.url : `${siteUrl}${payload.url}`) : undefined;
    const caption = buildCaption(payload);
    const replyMarkup = fullUrl ? { inline_keyboard: [[{ text: '🎬 View in LeMedia', url: fullUrl }]] } : undefined;

    // Prefer photo with caption when we have a poster — much nicer in Telegram
    if (payload.posterPath) {
      const photoUrl = `https://image.tmdb.org/t/p/w500${payload.posterPath}`;
      try {
        await axios.post(`https://api.telegram.org/bot${settings.botToken}/sendPhoto`, {
          chat_id: settings.chatId,
          photo: photoUrl,
          caption,
          parse_mode: 'HTML',
          ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
        return;
      } catch {
        // Fallback to text if photo send fails (e.g. invalid poster path)
      }
    }

    await axios.post(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      chat_id: settings.chatId,
      text: caption,
      parse_mode: 'HTML',
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      disable_web_page_preview: true,
    });
  },

  async testConnection(settings, locale = 'en') {
    await axios.post(`https://api.telegram.org/bot${settings.botToken}/sendMessage`, {
      chat_id: settings.chatId,
      text: `<b>✅ ${escapeHtml(renderNotificationTemplate('notifications.test.title', locale))}</b>\n${escapeHtml(renderNotificationTemplate('notifications.test.telegram', locale))}`,
      parse_mode: 'HTML',
    });
  },
};
