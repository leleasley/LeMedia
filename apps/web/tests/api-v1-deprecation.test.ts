import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

test("proxy adds deprecation headers for /api/v1 endpoints", () => {
  const request = new NextRequest("https://app.example.com/api/v1/admin/settings?foo=bar", {
    headers: { accept: "application/json" }
  });

  const response = proxy(request);
  assert.equal(response.headers.get("Deprecation"), "true");
  assert.equal(response.headers.get("Sunset"), "Wed, 30 Sep 2026 23:59:59 GMT");
  assert.equal(
    response.headers.get("Link"),
    "<https://app.example.com/api/admin/settings?foo=bar>; rel=\"successor-version\""
  );
});

test("proxy does not add deprecation headers for non-v1 endpoints", () => {
  const request = new NextRequest("https://app.example.com/api/admin/settings", {
    headers: { accept: "application/json" }
  });

  const response = proxy(request);
  assert.equal(response.headers.get("Deprecation"), null);
  assert.equal(response.headers.get("Sunset"), null);
  assert.equal(response.headers.get("Link"), null);
});
