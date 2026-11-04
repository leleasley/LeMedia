/**
 * Changes LeMedia made since zurg's last duplicate analysis: releases it removed (cleanup,
 * swaps, repairs that binned a copy) and copies a swap put into use. The cleanup page applies
 * them on top of the cached report, so a swap or removal shows at once instead of waiting for
 * the next multi-minute analysis. Each entry drops out when a newer analysis has seen it.
 */
export type Override = 'gone' | 'referenced';
const overrides = new Map<string, { state: Override; at: number }>();

export function markGone(hashes: string[]) {
  const now = Date.now();
  for (const h of hashes) overrides.set(h, { state: 'gone', at: now });
}

export function markReferenced(hashes: string[]) {
  const now = Date.now();
  for (const h of hashes) overrides.set(h, { state: 'referenced', at: now });
}

/** Overrides still newer than the analysis built at `builtAt` (older ones are already in it). */
export function activeOverrides(builtAt: string | null): Map<string, Override> {
  const built = builtAt ? Date.parse(builtAt) : 0;
  const out = new Map<string, Override>();
  for (const [h, o] of overrides) {
    if (o.at <= built) overrides.delete(h);
    else out.set(h, o.state);
  }
  return out;
}
