import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = path.join(rootDir, "app", "api");

const mutatingMethodRegex = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/g;

const policySignals = [
  "requireCsrf(",
  "isSameOriginRequest(",
  "checkRateLimit(",
  "enforceRateLimit(",
  "checkLockout(",
  "recordFailure(",
  "verifyTurnstileToken(",
  "requireUser(",
  "requireAdmin(",
  "getCurrentUser(",
  "getUser(",
  "assertApiAccess(",
  "requireAuth(",
  "assertSession(",
  "getSessionToken(",
  "getExternalApiAuth(",
  "verifyExternalApiKey(",
  "handleMediaListPost(",
  "handleMediaListDelete(",
];

const delegationSignals = [
  /\bDynamic(POST|PUT|PATCH|DELETE)\s*\(/,
  /\breturn\s+\w+(POST|PUT|PATCH|DELETE)\s*\(/,
  /\bexport\s*\{\s*(POST|PUT|PATCH|DELETE)\s+as\s+/,
];

type RouteViolation = {
  route: string;
  methods: string[];
};

function collectRouteFiles(dir: string): string[] {
  const output: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...collectRouteFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === "route.ts") output.push(fullPath);
  }
  return output;
}

test("mutating API routes include auth/csrf/rate-limit policy signals", () => {
  const routes = collectRouteFiles(apiDir);
  const violations: RouteViolation[] = [];
  let mutatingRouteCount = 0;

  for (const filePath of routes) {
    const source = fs.readFileSync(filePath, "utf8");
    const methods = [...source.matchAll(mutatingMethodRegex)].map(match => match[1]);
    if (methods.length === 0) continue;
    mutatingRouteCount += 1;

    const hasPolicySignal = policySignals.some(token => source.includes(token));
    const hasDelegationSignal = delegationSignals.some(regex => regex.test(source));

    if (!hasPolicySignal && !hasDelegationSignal) {
      const route = `/${path.relative(apiDir, filePath).replace(/\\/g, "/")}`;
      violations.push({ route, methods });
    }
  }

  assert.ok(mutatingRouteCount > 0, "expected to discover mutating API routes");

  assert.deepEqual(
    violations,
    [],
    `Found mutating routes without policy/delegation signals:\n${violations.map(v => `${v.route} [${v.methods.join(",")}]`).join("\n")}`
  );
});
