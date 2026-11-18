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
