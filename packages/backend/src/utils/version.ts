import { readFileSync } from 'node:fs';
import { PROJECT_PACKAGE_JSON } from './paths.js';

/**
 * The running LeMedia version, read once from the root package.json (the image copies it in).
 *
 * Versioning convention: semver, bumped by hand in the root + workspace package.json files with
 * a matching CHANGELOG.md section. Git tags use a `v` prefix (`v0.11.0`); comparisons strip it.
 */
export const APP_VERSION: string = JSON.parse(readFileSync(PROJECT_PACKAGE_JSON, 'utf-8')).version as string;

/** `v0.11.0` → `0.11.0`, so a tag and a package version compare cleanly. */
export function versionFromTag(tag: string): string {
  return tag.trim().replace(/^v/i, '');
}

/** Numeric compare of dotted versions (`0.9.1` vs `0.10.0`, four-part *arr builds too).
 *  Returns > 0 when `a` is newer than `b`, 0 when equal, < 0 when older. */
export function compareVersions(a: string, b: string): number {
  const pa = versionFromTag(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = versionFromTag(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/** True only when `latest` is strictly newer than `installed` — a build made ahead of the
 *  published release (or the same version on both sides) is not an update. */
export function isNewerVersion(latest: string | null | undefined, installed: string | null | undefined): boolean {
  if (!latest || !installed) return false;
  return compareVersions(latest, installed) > 0;
}
