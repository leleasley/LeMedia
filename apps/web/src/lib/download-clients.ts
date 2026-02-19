/**
 * Download client API wrappers for qBittorrent, SABnzbd, and nzbget.
 * Each client stores its base_url and api_key in the media_service table.
 * For qBittorrent: apiKey = WebUI API key (newer qBit) or password (older qBit with username in config.username)
 * For SABnzbd: apiKey = SABnzbd API key
 * For nzbget: apiKey = password (username stored in config.username, defaults to "nzbget")
 */

const DEFAULT_TIMEOUT_MS = 10_000;

function timeout() {
    return AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// qBittorrent
// ---------------------------------------------------------------------------

export type QbitTorrent = {
    hash: string;
    name: string;
    size: number;
    progress: number; // 0.0 – 1.0
    dlspeed: number; // bytes/s
    upspeed: number;
    eta: number; // seconds (-1 = infinity)
    state: string; // downloading, uploading, pausedDL, stalledDL, error, queued, etc.
    category: string;
    save_path: string;
    added_on: number;
    downloaded: number;
    uploaded: number;
    ratio: number;
    num_seeds: number;
    num_leechs: number;
};

export type QbitTransferInfo = {
    connection_status: "connected" | "firewalled" | "disconnected";
    dl_info_speed: number;
    dl_info_data: number;
    up_info_speed: number;
    up_info_data: number;
    dl_rate_limit: number;
    up_rate_limit: number;
};

async function qbitRequest(root: string, path: string, opts?: RequestInit): Promise<Response> {
    return fetch(`${root}${path}`, { ...opts, signal: timeout() });
}

async function qbitLogin(root: string, username: string, password: string): Promise<string> {
    const body = new URLSearchParams({ username, password });
    const res = await qbitRequest(root, "/api/v2/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
    });
    if (!res.ok) throw new Error(`qBittorrent login failed: HTTP ${res.status}`);
    const text = await res.text();
    if (text.trim() !== "Ok.") throw new Error("qBittorrent login rejected");
    const setCookie = res.headers.get("set-cookie") ?? "";
    const sid = setCookie.match(/SID=([^;]+)/)?.[1];
    if (!sid) throw new Error("qBittorrent: could not extract SID from login response");
    return sid;
}

export async function qbittorrentGetTorrents(
    baseUrl: string,
    apiKey: string,
    config: Record<string, unknown>
): Promise<QbitTorrent[]> {
    const root = baseUrl.replace(/\/+$/, "");

    // Try API key header first (qBit 4.6+ with API auth enabled)
    if (apiKey) {
        const res = await fetch(`${root}/api/v2/torrents/info`, {
            headers: { "X-WebUI-API-Key": apiKey },
            signal: timeout(),
        });
        if (res.ok) return res.json();
    }

    // Fall back to cookie-based auth with username/password
    const username = String(config.username ?? "admin");
    const sid = await qbitLogin(root, username, apiKey);
    const res = await fetch(`${root}/api/v2/torrents/info`, {
        headers: { Cookie: `SID=${sid}` },
        signal: timeout(),
    });
    if (!res.ok) throw new Error(`qBittorrent torrents/info: HTTP ${res.status}`);
    return res.json();
}

export async function qbittorrentGetTransferInfo(
    baseUrl: string,
    apiKey: string,
    config: Record<string, unknown>
): Promise<QbitTransferInfo> {
    const root = baseUrl.replace(/\/+$/, "");

    if (apiKey) {
        const res = await fetch(`${root}/api/v2/transfer/info`, {
            headers: { "X-WebUI-API-Key": apiKey },
            signal: timeout(),
        });
        if (res.ok) return res.json();
    }

    const username = String(config.username ?? "admin");
    const sid = await qbitLogin(root, username, apiKey);
    const res = await fetch(`${root}/api/v2/transfer/info`, {
        headers: { Cookie: `SID=${sid}` },
        signal: timeout(),
    });
    if (!res.ok) throw new Error(`qBittorrent transfer/info: HTTP ${res.status}`);
    return res.json();
}

// ---------------------------------------------------------------------------
// SABnzbd
// ---------------------------------------------------------------------------

export type SabnzbdSlot = {
    status: string;
    index: number;
    eta: string;
    mb: string;
    mbleft: string;
    mbmissing: string;
    size: string;
    sizeleft: string;
    filename: string;
    labels: string[];
    priority: string;
    cat: string;
    timeleft: string;
    percentage: string;
    nzo_id: string;
};

export type SabnzbdQueueResponse = {
    queue: {
        status: string;
        paused: boolean;
        noofslots_total: number;
        timeleft: string;
        speed: string;
        kbpersec: string;
        mb: string;
        mbleft: string;
        slots: SabnzbdSlot[];
    };
};

export async function sabnzbdGetQueue(baseUrl: string, apiKey: string): Promise<SabnzbdQueueResponse> {
    const root = baseUrl.replace(/\/+$/, "");
    const url = `${root}/api?mode=queue&output=json&apikey=${encodeURIComponent(apiKey)}&limit=50`;
    const res = await fetch(url, { signal: timeout() });
    if (!res.ok) throw new Error(`SABnzbd HTTP ${res.status}`);
    const data = await res.json();
    if (data?.status === false) throw new Error(data?.error ?? "SABnzbd API error");
    return data;
}

// ---------------------------------------------------------------------------
// nzbget
// ---------------------------------------------------------------------------

export type NzbgetGroup = {
    NZBID: number;
    NZBName: string;
    FileSizeMB: number;
    RemainingSizeMB: number;
    DownloadedSizeMB: number;
    Status: string; // DOWNLOADING, PAUSED, QUEUED, PP-QUEUED, LOADING_PARS, etc.
    Category: string;
    ActiveDownloads: number;
    TotalArticles: number;
    SuccessArticles: number;
    FailedArticles: number;
};

export type NzbgetStatus = {
    RemainingSizeMB: number;
    ForcedSizeMB: number;
    DownloadedSizeMB: number;
    MonthSizeMB: number;
    DaySizeMB: number;
    ArticleCacheMB: number;
    DownloadRate: number; // bytes/s
    DownloadLimit: number;
    ThreadCount: number;
    ParJobCount: number;
    PostJobCount: number;
    UrlCount: number;
    UpTimeSec: number;
    DownloadTimeSec: number;
    ServerStandBy: boolean;
    FeedActive: boolean;
    NewsServers: unknown[];
};

function nzbgetAuthHeader(apiKey: string, config: Record<string, unknown>): string {
    const username = String(config.username ?? "nzbget");
    return "Basic " + Buffer.from(`${username}:${apiKey}`).toString("base64");
}

async function nzbgetRpc(baseUrl: string, apiKey: string, config: Record<string, unknown>, method: string, params: unknown[] = []) {
    const root = baseUrl.replace(/\/+$/, "");
    const res = await fetch(`${root}/jsonrpc`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: nzbgetAuthHeader(apiKey, config),
        },
        body: JSON.stringify({ version: "1.1", method, params }),
        signal: timeout(),
    });
    if (!res.ok) throw new Error(`nzbget HTTP ${res.status}`);
    const data = await res.json();
    if (data?.error) throw new Error(data.error?.message ?? "nzbget RPC error");
    return data.result;
}

export async function nzbgetListGroups(
    baseUrl: string,
    apiKey: string,
    config: Record<string, unknown>
): Promise<NzbgetGroup[]> {
    return nzbgetRpc(baseUrl, apiKey, config, "listgroups", [0]);
}

export async function nzbgetGetStatus(
    baseUrl: string,
    apiKey: string,
    config: Record<string, unknown>
): Promise<NzbgetStatus> {
    return nzbgetRpc(baseUrl, apiKey, config, "status", []);
}
