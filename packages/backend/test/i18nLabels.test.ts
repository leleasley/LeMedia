import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards "proper names" for admin-facing label keys. JobsTab and the notification matrix
 * render backend-owned label keys (scheduler DEFAULT_JOBS labels, CORE_EVENT_TYPES labelKeys)
 * through the frontend locale bundles — a key missing from translation.json renders as the
 * raw key in the UI (e.g. `admin.jobs.labels.library_scan`). This test fails the moment a
 * new job or event type is registered without its en + fr strings.
 *
 * Reads the sources as text on purpose: importing the scheduler would drag in the whole
 * service graph (DB, *arr clients, plugin engine) for a static key check.
 */
const here = dirname(fileURLToPath(import.meta.url));
const backendSrc = resolve(here, '..', 'src');
const localesDir = resolve(here, '..', '..', 'frontend', 'src', 'i18n', 'locales');

function referencedKeys(): string[] {
  const sources = [
    readFileSync(resolve(backendSrc, 'services', 'scheduler.ts'), 'utf-8'),
    readFileSync(resolve(backendSrc, 'notifications', 'index.ts'), 'utf-8'),
  ];
  const found = new Set<string>();
  for (const src of sources) {
    for (const m of src.matchAll(/admin\.(?:jobs\.labels|notifications\.event)\.[a-z_]+/g)) {
      found.add(m[0]);
    }
  }
  return [...found].sort();
}

function localeBundle(lang: 'en' | 'fr'): Record<string, string> {
  return JSON.parse(readFileSync(resolve(localesDir, lang, 'translation.json'), 'utf-8'));
}

describe('admin label keys', () => {
  it('every job/event label referenced in backend sources exists (non-empty) in en + fr', () => {
    const keys = referencedKeys();
    expect(keys.length).toBeGreaterThan(0);
    const en = localeBundle('en');
    const fr = localeBundle('fr');
    for (const key of keys) {
      expect(en[key]?.length, `missing in en: ${key}`).toBeGreaterThan(0);
      expect(fr[key]?.length, `missing in fr: ${key}`).toBeGreaterThan(0);
    }
  });
});
