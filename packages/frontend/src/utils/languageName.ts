import i18n from '@/i18n';

/**
 * Human-readable name for an ISO 639-1 code, in the UI locale — "ko" → "Korean",
 * "ja" → "Japanese". Uses Intl.DisplayNames where available (all modern browsers and
 * iOS 14+), falling back to the raw code so the badge never renders empty.
 */
export function languageName(code: string | null | undefined): string {
  const clean = (code || '').trim().toLowerCase();
  if (!clean) return '';
  try {
    const names = new Intl.DisplayNames([i18n.language || 'en'], { type: 'language' });
    const name = names.of(clean);
    if (name && name.toLowerCase() !== clean) return name;
  } catch {
    // Intl.DisplayNames missing or the code unknown — fall through.
  }
  return clean.toUpperCase();
}

/** Compact language code for dense surfaces (poster cards): "ko" → "KO". */
export function languageCode(code: string | null | undefined): string {
  const clean = (code || '').trim().toLowerCase();
  if (!clean) return '';
  return clean.split('-')[0].slice(0, 2).toUpperCase();
}

/** True when a title's original language differs from the instance's own language — i.e. the
 *  title is foreign relative to how the library is curated. */
export function isForeignLanguage(code: string | null | undefined): boolean {
  const clean = (code || '').trim().toLowerCase().split('-')[0];
  if (!clean) return false;
  const instanceLang = (i18n.language || 'en').split('-')[0].toLowerCase();
  return clean !== instanceLang;
}
