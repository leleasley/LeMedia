export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function gcd(a: number, b: number): number {
  let left = Math.abs(a);
  let right = Math.abs(b);
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

export function createTonightQueueSeed(userId: number, isoDate: string): number {
  return hashSeed(`${userId}:${isoDate}`);
}

export function pickRotatingPages(seed: number, totalPages = 5, count = 2): number[] {
  const normalizedSeed = seed >>> 0;
  const safeTotalPages = Math.max(1, Math.min(20, Math.floor(totalPages)));
  const targetCount = Math.max(1, Math.min(Math.floor(count), safeTotalPages));
  const start = (normalizedSeed % safeTotalPages) + 1;

  let step = (Math.floor(normalizedSeed / safeTotalPages) % safeTotalPages) || 1;
  while (gcd(step, safeTotalPages) !== 1) {
    step += 1;
  }

  const pages: number[] = [];
  let cursor = start;
  while (pages.length < targetCount) {
    if (!pages.includes(cursor)) {
      pages.push(cursor);
    }
    cursor = ((cursor - 1 + step) % safeTotalPages) + 1;
  }

  return pages;
}

export function scoreSeededDiscoveryCandidate(
  tmdbId: number,
  voteAverage: number,
  baseScore: number,
  seed: number,
  slot: number
): number {
  const affinity = (hashSeed(`${seed}:${tmdbId}:${slot}`) % 600) / 100;
  return baseScore + Math.min(Math.max(voteAverage, 0), 10) + affinity;
}