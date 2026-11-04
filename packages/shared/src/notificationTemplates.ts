/** Single source of truth for `notifications.msg.*` localized templates.
 *
 *  Two consumers:
 *    - Backend `safeUserNotify` pre-translates the event-bus payload at emit time so plugin
 *      subscribers (Leonarr Discord embed, Slack pushers, …) get readable text instead of
 *      raw i18n keys.
 *    - Frontend NotificationBell re-translates per-user-language at render time.
 *
 *  Keeping both consumers on the same import means a new notification key (or a copy tweak
 *  in an existing one) lands once and propagates everywhere — no risk of the backend
 *  shipping a key the frontend doesn't know about, or vice versa. Frontend's i18next bundle
 *  doesn't import this directly today (it copies into `translation.json` as part of the
 *  build) — adding a CI check that `translation.json[key] === NOTIFICATION_TEMPLATES[lang][key]`
 *  is the next step if the locales diverge in practice.
 *
 *  Add a key here when you add a new `notifications.msg.*` payload type. Templates use the
 *  `{{var}}` interpolation convention — same syntax as i18next + the backend's
 *  `translateNotif` helper, so they're substitutable. */

export type NotificationLocale = 'en' | 'fr';

/** Each value is a Mustache-style template. `{{var}}` placeholders are filled from the
 *  caller's `metadata.msgParams` — see backend safeUserNotify and frontend NotificationBell
 *  for the rendering side. */
export const NOTIFICATION_TEMPLATES: Record<NotificationLocale, Record<string, string>> = {
  en: {
    'notifications.msg.request_auto_approved': 'Your request for "{{title}}" has been auto-approved.',
    'notifications.msg.request_approved':      'Your request for "{{title}}" has been approved.',
    'notifications.msg.request_declined':      'Your request for "{{title}}" has been declined.',
    'notifications.msg.media_available':       '"{{title}}" is now available.',
    // Digest coalescing (backend availability buffer): first title in a window notifies
    // alone; followers collapse into one of these. `titles` is pre-joined (≤5) by the
    // sender — "including" stays truthful when the list is truncated.
    'notifications.msg.media_available_digest_title': '{{count}} new titles available',
    'notifications.msg.media_available_digest':       '{{count}} titles now available, including {{titles}}.',
    'notifications.msg.digital_release_discovered':  '"{{title}}" is coming to digital on {{date}}.',
    'notifications.msg.digital_release_day':         '"{{title}}" is out now on digital.',
    'notifications.msg.support_reply':         'Reply on your ticket #{{ticketId}}',
    // Channel/broadcast pieces — rendered at the INSTANCE language by the providers/registry.
    'notifications.media_type.movie':          'Movie',
    'notifications.media_type.tv':             'Series',
    'notifications.link.view_in_lemedia':       'View in LeMedia',
    'notifications.event.request_new':         'New request',
    'notifications.event.request_approved':    'Request approved',
    'notifications.event.request_declined':    'Request declined',
    'notifications.event.media_available':     'Media available',
    'notifications.event.digital_release_discovered': 'Digital date found',
    'notifications.event.digital_release_day':        'Digital release day',
    'notifications.event.incident_banner':     'Incident',
    'notifications.event.list_added':          'List added titles',
    'notifications.event.app_update':          'App update',
    'notifications.event.zurg_broken':         'Zurg broken releases',
    'notifications.test.title':                'Test',
    'notifications.test.telegram':             'Telegram notification OK!',
    'notifications.test.discord':              'Discord notification OK!',
    'notifications.test.email':                'Email notification OK!',
    'notifications.push.request_approved.title': '✅ {{title}} ({{type}})',
    'notifications.push.request_declined.title': '❌ {{title}} ({{type}})',
    'notifications.push.request_approved.body': 'Request approved, it\'s on its way.',
    'notifications.push.request_declined.body': 'Request declined.',
    'notifications.type.movie': 'Movie',
    'notifications.type.tv': 'Series',
    'notifications.push.acquisition_stalled.title': '⚠️ {{title}} ({{type}})',
    'notifications.push.acquisition_stalled.body': 'No release found yet, {{reason}}.',
    'notifications.msg.acquisition_stalled': 'Still looking for "{{title}}": {{reason}}.',
    'notifications.push.media_available.title': '🎬 {{title}} ({{type}})',
    'notifications.push.media_available.body': 'Ready to watch now.',
    'notifications.push.media_available_digest.title': '🎬 {{count}} new titles ready to watch',
    'notifications.push.digital_release_discovered.title': '📅 {{title}} ({{type}})',
    'notifications.push.digital_release_discovered.body':  'Out to stream, rent or buy from {{date}}.',
    'notifications.push.digital_release_day.title': '💿 {{title}} ({{type}})',
    'notifications.push.where.stream': 'Streaming now on {{services}}.',
    'notifications.push.where.rent':   'Available to rent or buy on {{services}}.',
    'notifications.push.digital_release_day.body': 'Out on digital today, stream, rent or buy now.',
  },
  fr: {
    'notifications.msg.request_auto_approved': 'Votre demande pour "{{title}}" a été approuvée automatiquement.',
    'notifications.msg.request_approved':      'Votre demande pour "{{title}}" a été approuvée.',
    'notifications.msg.request_declined':      'Votre demande pour "{{title}}" a été refusée.',
    'notifications.msg.media_available':       '"{{title}}" est maintenant disponible.',
    'notifications.msg.media_available_digest_title': '{{count}} nouveaux titres disponibles',
    'notifications.msg.media_available_digest':       '{{count}} titres maintenant disponibles, dont {{titles}}.',
    'notifications.msg.digital_release_discovered':  'Date de sortie numérique trouvée pour "{{title}}" : {{date}}.',
    'notifications.msg.digital_release_day':         '"{{title}}" est disponible en numérique.',
    'notifications.msg.support_reply':         'Réponse sur votre ticket #{{ticketId}}',
    'notifications.media_type.movie':          'Film',
    'notifications.media_type.tv':             'Série',
    'notifications.link.view_in_lemedia':       'Voir dans LeMedia',
    'notifications.event.request_new':         'Nouvelle demande',
    'notifications.event.request_approved':    'Demande approuvée',
    'notifications.event.request_declined':    'Demande refusée',
    'notifications.event.media_available':     'Média disponible',
    'notifications.event.digital_release_discovered': 'Date numérique trouvée',
    'notifications.event.digital_release_day':        'Sortie numérique',
    'notifications.event.incident_banner':     'Incident',
    'notifications.event.list_added':          'Titres ajoutés par une liste',
    'notifications.event.app_update':          'Mise à jour d\'application',
    'notifications.event.zurg_broken':         'Sorties Zurg cassées',
    'notifications.test.title':                'Test',
    'notifications.test.telegram':             'Notification Telegram OK !',
    'notifications.test.discord':              'Notification Discord OK !',
    'notifications.test.email':                'Notification e-mail OK !',
    'notifications.push.request_approved.title': '✅ {{title}} ({{type}})',
    'notifications.push.request_declined.title': '❌ {{title}} ({{type}})',
    'notifications.push.request_approved.body': 'Demande approuvée, en cours d’ajout.',
    'notifications.push.request_declined.body': 'Demande refusée.',
    'notifications.type.movie': 'Film',
    'notifications.type.tv': 'Série',
    'notifications.push.acquisition_stalled.title': '⚠️ {{title}} ({{type}})',
    'notifications.push.acquisition_stalled.body': 'Aucune version trouvée pour l’instant, {{reason}}.',
    'notifications.msg.acquisition_stalled': 'Toujours à la recherche de « {{title}} » : {{reason}}.',
    'notifications.push.media_available.title': '🎬 {{title}} ({{type}})',
    'notifications.push.media_available.body': 'Prêt à regarder.',
    'notifications.push.media_available_digest.title': '🎬 {{count}} nouveaux titres prêts à regarder',
    'notifications.push.digital_release_discovered.title': '📅 {{title}} ({{type}})',
    'notifications.push.digital_release_discovered.body':  'Sortie numérique le {{date}}.',
    'notifications.push.digital_release_day.title': '💿 {{title}} ({{type}})',
    'notifications.push.where.stream': 'En streaming sur {{services}}.',
    'notifications.push.where.rent':   'En location ou à l’achat sur {{services}}.',
    'notifications.push.digital_release_day.body': 'Sortie numérique aujourd’hui, streaming, location ou achat.',
  },
};

/** Render a template against `params`. Returns the raw key when the lookup fails so a typo
 *  or missing locale stays visible (vs. silently falling back to an empty string). */
export function renderNotificationTemplate(
  key: string,
  locale: NotificationLocale,
  params: Record<string, unknown> = {},
): string {
  const bundle = NOTIFICATION_TEMPLATES[locale] ?? NOTIFICATION_TEMPLATES.en;
  const fallback = NOTIFICATION_TEMPLATES.en;
  const template = bundle[key] ?? fallback[key];
  if (!template) return key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (
    params[k] !== undefined ? String(params[k]) : `{{${k}}}`
  ));
}

/** Coerce any language string to a supported notification locale (single source for the
 *  `fr` vs `en` decision used across safeNotify, the registry and the providers). */
export function toNotificationLocale(lang: string | null | undefined): NotificationLocale {
  return lang === 'fr' ? 'fr' : 'en';
}

/** Localized media-type word ("Movie"/"Film", "Series"/"Série"); empty when the payload has no
 *  media type. Single source consumed by every channel provider — no per-provider ternary. */
export function notifMediaLabel(mediaType: 'movie' | 'tv' | undefined | null, locale: NotificationLocale): string {
  if (!mediaType) return '';
  return renderNotificationTemplate(`notifications.media_type.${mediaType === 'movie' ? 'movie' : 'tv'}`, locale);
}
