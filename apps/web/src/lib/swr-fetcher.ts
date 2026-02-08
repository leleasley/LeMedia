/**
 * Typed SWR fetchers with proper error handling
 */

export class FetchError extends Error {
  status: number;
  info?: any;

  constructor(message: string, status: number, info?: any) {
    super(message);
    this.name = "FetchError";
    this.status = status;
    this.info = info;
  }
}

/**
 * Generic typed fetcher for SWR with error handling
 * Checks response status and throws FetchError on non-2xx responses
 */
export async function swrFetcher<T = any>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  
  // Try to parse JSON response
  let data: any;
  try {
    data = await res.json();
  } catch (e) {
    // If we can't parse JSON, throw a generic error
    if (!res.ok) {
      throw new FetchError(
        `Request failed with status ${res.status}`,
        res.status
      );
    }
    // If response is OK but not JSON, return empty object
    return {} as T;
  }

  // Check response status - throw error for non-2xx
  if (!res.ok) {
    const message = data?.error || data?.message || `Request failed with status ${res.status}`;
    throw new FetchError(message, res.status, data);
  }

  return data as T;
}

/**
 * Fetcher that includes credentials (for authenticated endpoints)
 */
export async function swrAuthFetcher<T = any>(url: string): Promise<T> {
  return swrFetcher<T>(url);
}

/**
 * Fetcher for POST requests (useful for mutations)
 */
export async function swrPostFetcher<T = any>(
  url: string,
  body?: any
): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: any;
  try {
    data = await res.json();
  } catch (e) {
    if (!res.ok) {
      throw new FetchError(
        `Request failed with status ${res.status}`,
        res.status
      );
    }
    return {} as T;
  }

  if (!res.ok) {
    const message = data?.error || data?.message || `Request failed with status ${res.status}`;
    throw new FetchError(message, res.status, data);
  }

  return data as T;
}
