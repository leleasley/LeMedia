import "server-only";
import webPackageJson from "../../package.json";

export type ReleaseUpdateInfo = {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  latestTag: string;
  latestUrl: string;
};

type GithubReleasePayload = {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
  prerelease?: boolean;
};

function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, "").split("-")[0];
}

function parseVersion(value: string): [number, number, number] | null {
  const normalized = normalizeVersion(value);
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function isVersionGreater(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  if (!latestParts || !currentParts) return false;

  for (let index = 0; index < 3; index += 1) {
    if (latestParts[index] > currentParts[index]) return true;
    if (latestParts[index] < currentParts[index]) return false;
  }

  return false;
}

export function getCurrentAppVersion(): string {
  return normalizeVersion(webPackageJson.version ?? "0.1.0");
}

export async function getGithubReleaseUpdateInfo(currentVersion: string): Promise<ReleaseUpdateInfo | null> {
  const repository = (process.env.GITHUB_RELEASE_REPOSITORY || process.env.GITHUB_REPOSITORY || "leleasley/LeMedia").trim();
  if (!repository || !repository.includes("/")) return null;

  const url = `https://api.github.com/repos/${repository}/releases/latest`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "LeMedia",
  };

  const githubToken = (process.env.GITHUB_RELEASE_TOKEN || process.env.GITHUB_TOKEN || "").trim();
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers,
      cache: "no-store",
    });
    if (!response.ok) return null;

    const release = (await response.json()) as GithubReleasePayload;
    if (!release?.tag_name || !release?.html_url) return null;
    if (release.draft || release.prerelease) return null;

    const latestVersion = normalizeVersion(release.tag_name);
    const normalizedCurrent = normalizeVersion(currentVersion);
    const hasUpdate = isVersionGreater(latestVersion, normalizedCurrent);

    return {
      hasUpdate,
      currentVersion: normalizedCurrent,
      latestVersion,
      latestTag: release.tag_name,
      latestUrl: release.html_url,
    };
  } catch {
    return null;
  }
}