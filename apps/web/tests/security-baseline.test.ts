import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NextRequest } from "next/server";
import { fileURLToPath } from "node:url";
import { isSameOriginRequest } from "../src/lib/proxy";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("same-origin request validation accepts same origin and rejects cross-origin", () => {
  const sameOriginReq = new NextRequest("https://app.example.com/api/login", {
    method: "POST",
    headers: { origin: "https://app.example.com" }
  });
  assert.equal(isSameOriginRequest(sameOriginReq, "https://app.example.com"), true);

  const crossOriginReq = new NextRequest("https://app.example.com/api/login", {
    method: "POST",
    headers: { origin: "https://evil.example.net" }
  });
  assert.equal(isSameOriginRequest(crossOriginReq, "https://app.example.com"), false);
});

test("in-memory rate limit and lockout work without Redis", async () => {
  process.env.REDIS_URL = "";
  const rateLimit = await import("../src/lib/rate-limit");

  const rateKey = `tests:rate:${Date.now()}`;
  const first = await rateLimit.checkRateLimit(rateKey, { windowMs: 5_000, max: 1 });
  const second = await rateLimit.checkRateLimit(rateKey, { windowMs: 5_000, max: 1 });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  if (!second.ok) {
    assert.ok(second.retryAfterSec >= 1);
  }

  const lockKey = `tests:lockout:${Date.now()}`;
  const lockOpts = { windowMs: 10_000, max: 2, banMs: 10_000 };
  const fail1 = await rateLimit.recordFailure(lockKey, lockOpts);
  const fail2 = await rateLimit.recordFailure(lockKey, lockOpts);
  assert.equal(fail1.locked, false);
  assert.equal(fail2.locked, true);

  const lockState = await rateLimit.checkLockout(lockKey, lockOpts);
  assert.equal(lockState.locked, true);

  await rateLimit.clearFailures(lockKey);
  const afterClear = await rateLimit.checkLockout(lockKey, lockOpts);
  assert.equal(afterClear.locked, false);
});

test("core setup and login routes keep critical security controls", () => {
  const setupRoute = fs.readFileSync(path.join(rootDir, "app", "api", "setup", "complete", "route.ts"), "utf8");
  assert.ok(setupRoute.includes("isSameOriginRequest("), "setup route must enforce origin checks");
  assert.ok(setupRoute.includes("checkRateLimit("), "setup route must enforce rate limiting");
  assert.ok(setupRoute.includes("verifyTurnstileToken("), "setup route must verify Turnstile when enabled");

  const loginRoute = fs.readFileSync(path.join(rootDir, "app", "api", "login", "route.ts"), "utf8");
  assert.ok(loginRoute.includes("checkRateLimit("), "login route must enforce rate limiting");
  assert.ok(loginRoute.includes("checkLockout("), "login route must enforce lockout checks");
  assert.ok(loginRoute.includes("recordFailure("), "login route must record failed attempts");
  assert.ok(loginRoute.includes("isSameOriginRequest("), "login route must enforce origin checks");
});
