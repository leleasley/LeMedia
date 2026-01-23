export async function baseFetch(
  baseUrl: string,
  path: string,
  apiKey: string,
  init?: RequestInit,
  serviceName?: string,
  timeoutOverride?: number
) {
  const url = new URL(baseUrl + path);
  const headers = new Headers(init?.headers);
  headers.set("X-Api-Key", apiKey);
  if (init?.body) headers.set("Content-Type", "application/json");

  const timeoutMsRaw = process.env.SERVICE_FETCH_TIMEOUT_MS;
  const defaultTimeout = Number.isFinite(Number(timeoutMsRaw)) ? Number(timeoutMsRaw) : 20000;
  const timeoutMs = timeoutOverride ?? defaultTimeout;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, cache: "no-store", signal: controller.signal });
  } catch (error: any) {
    clearTimeout(timer);
    const isTimeout = error?.name === "AbortError";
    const message = isTimeout
      ? `Request timed out after ${timeoutMs}ms`
      : (error?.message ?? String(error));
    throw new ServiceHttpError({
      serviceName,
      path,
      status: isTimeout ? 504 : 502,
      body: message
    });
  }
  clearTimeout(timer);
  const text = await res.text();
  if (!res.ok) {
    throw new ServiceHttpError({
      serviceName,
      path,
      status: res.status,
      body: text
    });
  }
  if (res.status === 204) return {};
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (e: any) {
    const snippet = text.length > 400 ? `${text.slice(0, 400)}…` : text;
    throw new Error(
      `${serviceName} ${path} returned non-JSON: ${e?.message ?? String(e)} (${snippet})`
    );
  }
}

export class ServiceHttpError extends Error {
  status: number;
  serviceName?: string;
  path: string;
  body: string;

  constructor(input: { status: number; serviceName?: string; path: string; body: string }) {
    const name = input.serviceName || "Service";
    const bodySnippet = input.body.length > 800 ? `${input.body.slice(0, 800)}…` : input.body;
    super(`${name} ${input.path} failed: ${input.status} ${bodySnippet}`);
    this.name = "ServiceHttpError";
    this.status = input.status;
    this.serviceName = input.serviceName;
    this.path = input.path;
    this.body = input.body;
  }
}

export function isServiceNotFoundError(err: unknown): boolean {
  return err instanceof ServiceHttpError && err.status === 404;
}

export async function readJson(res: Response) {
  const clone = res.clone();
  try {
    return await res.json();
  } catch (error: any) {
    const text = (await clone.text().catch(() => ""))?.trim();
    const detail = text ? `: ${text}` : "";
    throw new Error(`HTTP ${res.status}${detail}`);
  }
}
