import semver from 'semver';
import type { PluginManifest } from './types.js';
import { readFileSync } from 'node:fs';
import { PROJECT_PACKAGE_JSON } from '../utils/paths.js';

/**
 * 🟢 `verified`     — LeMedia's current version is listed in the plugin's testedAgainst.
 * 🟡 `untested`     — LeMedia's version is in engines.lemedia range but not explicitly tested.
 * 🔴 `incompatible` — LeMedia's version is outside engines.lemedia range — plugin is refused.
 * ⚪ `unknown`      — Plugin declares no engines.lemedia at all (legacy pre-L5 plugin).
 */
export type CompatStatus = 'verified' | 'untested' | 'incompatible' | 'unknown';

let cachedVersion: string | null = null;
export function getLeMediaVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    // Read from root package.json — the prod Docker image rewrites packages/backend/package.json
    // from package.prod.json which has no version field.
    const pkg = JSON.parse(readFileSync(PROJECT_PACKAGE_JSON, 'utf-8')) as { version?: string };
    cachedVersion = pkg.version ?? '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}

export interface CompatResult {
  status: CompatStatus;
  range?: string;
  lemediaVersion: string;
  reason?: string;
}

export function checkCompat(manifest: PluginManifest, lemediaVersion = getLeMediaVersion()): CompatResult {
  const range = manifest.engines?.lemedia;
  if (!range) {
    return {
      status: 'unknown',
      lemediaVersion,
      reason: 'Plugin does not declare engines.lemedia, cannot verify compatibility',
    };
  }
  if (!semver.validRange(range)) {
    return {
      status: 'incompatible',
      range,
      lemediaVersion,
      reason: `Invalid semver range: "${range}"`,
    };
  }
  if (!semver.satisfies(lemediaVersion, range, { includePrerelease: true })) {
    return {
      status: 'incompatible',
      range,
      lemediaVersion,
      reason: `LeMedia ${lemediaVersion} does not satisfy ${range}`,
    };
  }
  const tested = manifest.engines?.testedAgainst ?? [];
  if (tested.includes(lemediaVersion)) {
    return { status: 'verified', range, lemediaVersion };
  }
  return {
    status: 'untested',
    range,
    lemediaVersion,
    reason: `LeMedia ${lemediaVersion} is within range but wasn't explicitly tested by the author`,
  };
}
