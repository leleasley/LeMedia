import { NextRequest } from "next/server";
import { extractExternalApiKey } from "@/lib/external-api";
import { cacheableJsonResponseWithETag } from "@/lib/api-optimization";

const GITHUB_REPO = "leleasley/LeMedia";
const UPDATE_CHECK_TTL = 60 * 60 * 1000; // cache GitHub result for 1 hour

// Module-level cache so all requests benefit from a single GitHub API call
let updateCache: { updateAvailable: boolean; checkedAt: number } | null = null;

function toCompatVersion(rawVersion: string): string {
  const v = (rawVersion || "").trim();
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!match) return "2.0.0";
  const major = Number(match[1] || 0);
  if (major >= 2) return `${match[1]}.${match[2]}.${match[3]}`;
  return "2.0.0";
}

/** Returns true when `latest` is strictly newer than `current` (semver). */
function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, "").split(".").map(n => parseInt(n, 10) || 0);
  const [lMaj, lMin, lPat] = parse(latest);
  const [cMaj, cMin, cPat] = parse(current);
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

async function checkForUpdates(currentVersion: string): Promise<boolean> {
  // Only release images should prompt for updates; local/source builds never nag
  if (process.env.BUILD_SOURCE !== "release") return false;

  const now = Date.now();
  if (updateCache && now - updateCache.checkedAt < UPDATE_CHECK_TTL) {
    return updateCache.updateAvailable;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "LeMedia-UpdateCheck",
        },
        signal: AbortSignal.timeout(5000),
        cache: "no-store",
      }
    );
    if (!res.ok) {
      updateCache = { updateAvailable: false, checkedAt: now };
      return false;
    }
    const data = await res.json() as { tag_name?: string };
    const latest = (data.tag_name ?? "").replace(/^v/, "");
    const current = currentVersion.replace(/^v/, "");
    const updateAvailable = !!latest && isNewerVersion(latest, current);
    updateCache = { updateAvailable, checkedAt: now };
    return updateAvailable;
  } catch {
    updateCache = { updateAvailable: false, checkedAt: now };
    return false;
  }
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
  const rawVersion = process.env.APP_VERSION ?? "0.1.0";
  const reportedVersion = toCompatVersion(rawVersion);
  const updateAvailable = await checkForUpdates(rawVersion);
  return cacheableJsonResponseWithETag(req, {
    version: reportedVersion,
    commitTag: process.env.COMMIT_TAG ?? "local",
    updateAvailable,
    commitsBehind: 0,
    restartRequired: false
  }, { maxAge: 60, sMaxAge: 120 });
}

