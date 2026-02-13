import { NextRequest } from "next/server";
import { extractExternalApiKey, verifyExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";
import { getUser } from "@/auth";

function toCompatVersion(rawVersion: string): string {
  const v = (rawVersion || "").trim();
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!match) return "2.0.0";
  const major = Number(match[1] || 0);
  if (major >= 2) return `${match[1]}.${match[2]}.${match[3]}`;
  return "2.0.0";
}

function extractApiKey(req: NextRequest) {
  return req.headers.get("x-api-key")
    || req.headers.get("X-Api-Key")
    || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    || extractExternalApiKey(req)
    || "";
}

export async function GET(req: NextRequest) {
  // Status endpoint is public (like Overseerr) to allow external integrations
  // to verify connectivity without authentication
  const reportedVersion = toCompatVersion(process.env.APP_VERSION ?? "0.1.0");
  return cacheableJsonResponseWithETag(req, {
    version: reportedVersion,
    commitTag: process.env.COMMIT_TAG ?? "local",
    updateAvailable: false,
    commitsBehind: 0,
    restartRequired: false
  }, { maxAge: 60, sMaxAge: 120 });
}
