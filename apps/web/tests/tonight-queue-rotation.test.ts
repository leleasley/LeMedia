import assert from "node:assert/strict";
import test from "node:test";

import {
  createTonightQueueSeed,
  pickRotatingPages,
  scoreSeededDiscoveryCandidate,
} from "../src/lib/tonight-queue";

test("tonight queue page selection is stable for the same user and day", () => {
  const seed = createTonightQueueSeed(42, "2026-04-15");

  assert.deepEqual(pickRotatingPages(seed, 5, 2), pickRotatingPages(seed, 5, 2));
});

test("tonight queue page selection rotates across days", () => {
  const todaySeed = createTonightQueueSeed(42, "2026-04-15");
  const tomorrowSeed = createTonightQueueSeed(42, "2026-04-16");

  assert.notDeepEqual(pickRotatingPages(todaySeed, 5, 2), pickRotatingPages(tomorrowSeed, 5, 2));
});

test("seeded discovery scoring changes candidate ordering across days", () => {
  const firstSeed = createTonightQueueSeed(42, "2026-04-15");
  const secondSeed = createTonightQueueSeed(42, "2026-04-16");
  const candidateIds = [100, 101, 102, 103];

  const firstOrder = candidateIds
    .map((id, index) => ({ id, score: scoreSeededDiscoveryCandidate(id, 7.2, 70, firstSeed, index) }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.id);

  const secondOrder = candidateIds
    .map((id, index) => ({ id, score: scoreSeededDiscoveryCandidate(id, 7.2, 70, secondSeed, index) }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.id);

  assert.notDeepEqual(firstOrder, secondOrder);
});