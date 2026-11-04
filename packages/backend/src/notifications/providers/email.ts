import { renderNotificationTemplate, notifMediaLabel } from '@lemedia/shared';
import type { NotificationLocale } from '@lemedia/shared';
import type { NotificationProvider, NotificationPayload } from '../types.js';
import { sendMail } from '../../services/mailer.js';
import { buildEmailHtml } from '../../services/emailLayout.js';
import { getAppSettings } from '../../utils/appSettings.js';

function escapeHtml(text: string): string {
  return text.replaceAll(/&/g, '&amp;').replaceAll(/</g, '&lt;').replaceAll(/>/g, '&gt;').replaceAll(/"/g, '&quot;');
}

async function buildHtml(payload: NotificationPayload, siteName: string, siteUrl: string | null): Promise<string> {
  const locale = payload.language ?? 'en';
  const title = escapeHtml(payload.title);
  const username = payload.username ? escapeHtml(payload.username) : undefined;
  const mediaLabel = notifMediaLabel(payload.mediaType, locale);
  const msg = `${title}${mediaLabel ? ` (${mediaLabel})` : ''}${username ? `, ${username}` : ''}`;
  const poster = payload.posterPath
    ? `<br/><img src="https://image.tmdb.org/t/p/w185${payload.posterPath}" alt="" style="border-radius:8px;margin-top:12px" />`
    : '';

  if (payload.type === 'incident_banner') {
    const incident = escapeHtml(renderNotificationTemplate('notifications.event.incident_banner', locale));
    const body = `<p style="margin:0">${escapeHtml(payload.message || '')}</p>`;
    return buildEmailHtml({ siteName, siteUrl, title: incident, bodyHtml: body, footerNote: '' });
  }
  const label = escapeHtml(payload.label ?? payload.type);
  const extra = payload.message ? `<p style="margin:12px 0 0">${escapeHtml(payload.message).replace(/\n/g, '<br/>')}</p>` : '';
  const body = `<p style="margin:0">${msg}</p>${extra}${poster}`;
  return buildEmailHtml({ siteName, siteUrl, title: label, bodyHtml: body, footerNote: '' });
}

/** Plain-text counterpart so the mail isn't HTML-only (spam filters and text clients both care). */
function buildText(payload: NotificationPayload, locale: NotificationLocale): string {
  if (payload.type === 'incident_banner') {
    return `${renderNotificationTemplate('notifications.event.incident_banner', locale)}\n\n${payload.message ?? ''}`;
  }
  const mediaLabel = notifMediaLabel(payload.mediaType, locale);
  return [
    payload.label ?? payload.type,
    `${payload.title}${mediaLabel ? ` (${mediaLabel})` : ''}${payload.username ? `, ${payload.username}` : ''}`,
    payload.message ?? '',
  ].join('\n\n');
}

/**
 * Email notification channel. It owns the recipient and nothing else: the transport (SMTP or
 * Resend, credentials, From address) is instance-wide and lives in Admin → System → Mail, shared
 * with password reset. One transport, several consumers — configuring it twice was the bug.
 */
export const emailProvider: NotificationProvider = {
  id: 'email',
  nameKey: 'admin.notifications.provider.email',
  icon: 'Mail',
  settingsSchema: [
    {
      key: 'toEmail',
      labelKey: 'admin.notifications.provider.email.to',
      type: 'text',
      placeholder: 'admin@domain.com',
      required: true,
    },
  ],

  async send(settings, payload) {
    const appSettings = await getAppSettings().catch(() => null);
    const siteName = appSettings?.siteName || 'LeMedia';
    const siteUrl = appSettings?.siteUrl ?? null;
    await sendMail({
      to: settings.toEmail,
      subject: `[${siteName}] ${payload.label ?? payload.type}`,
      html: await buildHtml(payload, siteName, siteUrl),
      text: buildText(payload, payload.language ?? 'en'),
    });
  },

  async testConnection(settings, locale = 'en') {
    const appSettings = await getAppSettings().catch(() => null);
    const siteName = appSettings?.siteName || 'LeMedia';
    const siteUrl = appSettings?.siteUrl ?? null;
    const testTitle = renderNotificationTemplate('notifications.test.title', locale);
    const body = renderNotificationTemplate('notifications.test.email', locale);
    const html = buildEmailHtml({ siteName, siteUrl, title: testTitle, bodyHtml: `<p style="margin:0">${escapeHtml(body)}</p>` });
    await sendMail({
      to: settings.toEmail,
      subject: `[${siteName}] ${testTitle}`,
      html,
      text: `${testTitle}\n\n${body}`,
    });
  },
};
