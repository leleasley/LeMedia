import { describe, it, expect } from 'vitest';
import { languageCode, languageName, isForeignLanguage } from './languageName';

/**
 * Guards the language badge shown on media detail pages and poster cards — the signal that
 * tells a user at a glance that a title is foreign.
 */

describe('languageCode', () => {
  it('upper-cases the ISO 639-1 code for the compact card badge', () => {
    expect(languageCode('ko')).toBe('KO');
    expect(languageCode('ja')).toBe('JA');
    expect(languageCode('FR')).toBe('FR');
  });

  it('drops any region suffix and extra characters', () => {
    expect(languageCode('pt-BR')).toBe('PT');
    expect(languageCode('en-US')).toBe('EN');
  });

  it('returns an empty string for missing codes', () => {
    expect(languageCode(null)).toBe('');
    expect(languageCode(undefined)).toBe('');
    expect(languageCode('')).toBe('');
  });
});

describe('languageName', () => {
  it('resolves a code to its English name', () => {
    expect(languageName('ko')).toBe('Korean');
    expect(languageName('ja')).toBe('Japanese');
    expect(languageName('fr')).toBe('French');
  });

  it('falls back to the code itself when the language is unknown', () => {
    // A code Intl.DisplayNames doesn't know must still render something.
    expect(languageName('qqq')).not.toBe('');
  });

  it('returns an empty string for missing codes', () => {
    expect(languageName(null)).toBe('');
  });
});

describe('isForeignLanguage', () => {
  it('treats a different language as foreign', () => {
    expect(isForeignLanguage('ko')).toBe(true);
    expect(isForeignLanguage('ja')).toBe(true);
  });

  it('treats the instance language as native', () => {
    // The UI locale is synced to the instance language, which is 'en' in this test env.
    expect(isForeignLanguage('en')).toBe(false);
  });

  it('ignores a region suffix when comparing', () => {
    expect(isForeignLanguage('en-US')).toBe(false);
  });

  it('treats a missing language as not foreign (no badge)', () => {
    expect(isForeignLanguage(null)).toBe(false);
    expect(isForeignLanguage('')).toBe(false);
  });
});
