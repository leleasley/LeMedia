import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const componentsDir = path.join(rootDir, "src", "components");

function collectTsFiles(dir: string): string[] {
  const output: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...collectTsFiles(fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) output.push(fullPath);
  }
  return output;
}

test("components auth directory casing is normalized", () => {
  const legacyAuthDir = path.join(componentsDir, "Auth");
  const canonicalAuthDir = path.join(componentsDir, "auth");

  assert.equal(fs.existsSync(canonicalAuthDir), true, "expected components/auth to exist");
  assert.equal(fs.existsSync(legacyAuthDir), false, "components/Auth must not exist");
});

test("no source imports the legacy components/Auth path", () => {
  const sourceDirs = [path.join(rootDir, "app"), path.join(rootDir, "src")];
  const files = sourceDirs.flatMap(collectTsFiles);

  const offenders: string[] = [];
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    if (content.includes("@/components/Auth/")) {
      offenders.push(path.relative(rootDir, filePath));
    }
  }

  assert.deepEqual(offenders, [], `found legacy Auth imports:\n${offenders.join("\n")}`);
});
