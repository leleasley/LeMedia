import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const scanDirs = [
  path.join(rootDir, "src"),
  path.join(rootDir, "app", "(app)"),
  path.join(rootDir, "app", "(public)"),
  path.join(rootDir, "public"),
];

const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const markerRegex = /\/api\/v1\//g;

const BASELINE_FILE_COUNT = 113;
const BASELINE_TOTAL_MATCHES = 393;

type MarkerStats = {
  fileCount: number;
  totalMatches: number;
  files: Array<{ path: string; matches: number }>;
};

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const output: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!allowedExtensions.has(path.extname(entry.name))) continue;
    output.push(fullPath);
  }

  return output;
}

function collectMarkerStats(): MarkerStats {
  const files = scanDirs.flatMap(collectSourceFiles);
  const results: MarkerStats["files"] = [];

  for (const filePath of files) {
    const source = fs.readFileSync(filePath, "utf8");
    const matches = source.match(markerRegex)?.length ?? 0;
    if (matches === 0) continue;

    results.push({
      path: path.relative(rootDir, filePath).replace(/\\/g, "/"),
      matches,
    });
  }

  results.sort((a, b) => a.path.localeCompare(b.path));
  const totalMatches = results.reduce((sum, item) => sum + item.matches, 0);

  return {
    fileCount: results.length,
    totalMatches,
    files: results,
  };
}

test("client /api/v1 usage does not increase", () => {
  const stats = collectMarkerStats();

  assert.ok(
    stats.fileCount <= BASELINE_FILE_COUNT,
    `Client /api/v1 file count increased from ${BASELINE_FILE_COUNT} to ${stats.fileCount}`
  );

  assert.ok(
    stats.totalMatches <= BASELINE_TOTAL_MATCHES,
    `Client /api/v1 usage increased from ${BASELINE_TOTAL_MATCHES} to ${stats.totalMatches}`
  );

  assert.ok(stats.totalMatches > 0, "expected current client /api/v1 baseline usage to be non-zero");
});
