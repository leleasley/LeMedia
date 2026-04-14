export function pickTrailerUrl(media: any): string | null {
  const list: any[] = media?.videos?.results ?? [];
  if (!Array.isArray(list) || list.length === 0) return null;

  const yt = list.filter(v => (v?.site || "").toLowerCase() === "youtube");
  const candidates = yt.length ? yt : list;

  const score = (v: any) => {
    const type = (v?.type || "").toLowerCase();
    const name = (v?.name || "").toLowerCase();
    return (
      (v?.official ? 100 : 0) +
      (type === "trailer" ? 50 : 0) +
      (name.includes("official") ? 10 : 0) +
      (typeof v?.size === "number" ? Math.min(10, v.size / 360) : 0)
    );
  };

  const best = [...candidates].sort((a, b) => score(b) - score(a))[0];
  const key = best?.key;
  if (!key) return null;

  if ((best?.site || "").toLowerCase() === "youtube") return `https://www.youtube.com/watch?v=${key}`;
  return null;
}

export type ResolvedTrailerResult = {
  url: string | null;
  source: "tmdb" | "youtube-fallback" | null;
  replacedPreferred: boolean;
};

const YOUTUBE_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

function extractYouTubeVideoId(url: string): string | null {
  try {
    const value = new URL(url);
    const host = value.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      return value.pathname.replace(/^\/+/, "").split("/")[0] || null;
    }
    if (host.endsWith("youtube.com")) {
      const videoId = value.searchParams.get("v");
      if (videoId) return videoId;
      const parts = value.pathname.split("/").filter(Boolean);
      if (parts[0] === "embed" && parts[1]) return parts[1];
      if (parts[0] === "shorts" && parts[1]) return parts[1];
    }
  } catch {
    return null;
  }
  return null;
}

function buildYouTubeWatchUrl(videoId: string) {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

async function fetchYouTubeHtml(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(url, {
      headers: YOUTUBE_FETCH_HEADERS,
      next: { revalidate: 60 * 60 * 6 },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function isPlayableYouTubeUrl(url: string): Promise<boolean> {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return false;

  const html = await fetchYouTubeHtml(buildYouTubeWatchUrl(videoId));
  if (!html) return false;

  if (/not available in your country/i.test(html)) {
    return false;
  }

  const playabilityMatch = html.match(/"playabilityStatus":\{"status":"([^"]+)"(?:,"reason":"([^"]*)")?/);
  const status = playabilityMatch?.[1] ?? null;
  if (!status) return true;

  return status === "OK";
}

async function searchYouTubeTrailerCandidates(queries: string[], maxResults = 8): Promise<string[]> {
  const uniqueQueries = Array.from(new Set(queries.map((query) => query.trim()).filter(Boolean)));
  const candidateIds: string[] = [];

  for (const query of uniqueQueries) {
    const html = await fetchYouTubeHtml(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`
    ).catch(() => null);

    if (!html) continue;

    const matches = Array.from(html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)).map((match) => match[1]);
    for (const videoId of matches) {
      if (!candidateIds.includes(videoId)) {
        candidateIds.push(videoId);
      }
      if (candidateIds.length >= maxResults) {
        return candidateIds.map(buildYouTubeWatchUrl);
      }
    }
  }

  return candidateIds.map(buildYouTubeWatchUrl);
}

export async function searchYouTubeTrailerUrl(queries: string[]): Promise<string | null> {
  const candidates = await searchYouTubeTrailerCandidates(queries, 6);
  for (const candidate of candidates) {
    if (await isPlayableYouTubeUrl(candidate).catch(() => false)) {
      return candidate;
    }
  }
  return null;
}

export async function resolvePlayableTrailer(input: {
  preferredUrl?: string | null;
  queries: string[];
}): Promise<ResolvedTrailerResult> {
  const candidates: string[] = [];
  if (input.preferredUrl) {
    candidates.push(input.preferredUrl);
  }

  const searchCandidates = await searchYouTubeTrailerCandidates(input.queries, 6).catch(() => []);
  for (const candidate of searchCandidates) {
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  for (const candidate of candidates) {
    if (await isPlayableYouTubeUrl(candidate).catch(() => false)) {
      const isPreferred = Boolean(input.preferredUrl) && candidate === input.preferredUrl;
      return {
        url: candidate,
        source: isPreferred ? "tmdb" : "youtube-fallback",
        replacedPreferred: Boolean(input.preferredUrl) && !isPreferred,
      };
    }
  }

  return {
    url: null,
    source: null,
    replacedPreferred: false,
  };
}

