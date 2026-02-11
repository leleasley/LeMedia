import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(rootDir, "app", "api");
const baselinePath = path.join(rootDir, "tests", "fixtures", "api-duplicate-baseline.json");

type DuplicatePair = {
  base: string;
  v1: string;
};

type DuplicateBaseline = {
  pairCount: number;
  pairs: DuplicatePair[];
};

function collectRoutePaths(dir: string): string[] {
  const output: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...collectRoutePaths(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") {
      output.push(`/${path.relative(apiDir, fullPath).replace(/\\/g, "/")}`);
    }
  }
  return output.sort();
}

function findDuplicatePairs(routes: string[]): DuplicatePair[] {
  const routeSet = new Set(routes);
  const pairs: DuplicatePair[] = [];

  for (const route of routes) {
    if (!route.startsWith("/v1/")) continue;
    const base = route.replace(/^\/v1/, "");
    if (routeSet.has(base)) pairs.push({ base, v1: route });
  }

  return pairs.sort((a, b) => `${a.base}|${a.v1}`.localeCompare(`${b.base}|${b.v1}`));
}

test("no new duplicate /api and /api/v1 route pairs are introduced", () => {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")) as DuplicateBaseline;
  const baselineSet = new Set(baseline.pairs.map(pair => `${pair.base}|${pair.v1}`));

  const currentPairs = findDuplicatePairs(collectRoutePaths(apiDir));
  const currentSet = new Set(currentPairs.map(pair => `${pair.base}|${pair.v1}`));

  const introduced = currentPairs.filter(pair => !baselineSet.has(`${pair.base}|${pair.v1}`));

  assert.equal(
    introduced.length,
    0,
    `New duplicate API pairs detected:\n${introduced.map(pair => `${pair.base} <-> ${pair.v1}`).join("\n")}`
  );

  assert.ok(
    currentPairs.length <= baseline.pairCount,
    `Duplicate pair count increased from ${baseline.pairCount} to ${currentPairs.length}`
  );

  assert.ok(currentSet.size > 0, "expected duplicate pairs baseline to contain entries");
});
