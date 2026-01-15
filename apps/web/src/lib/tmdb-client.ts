"use client";

export type TmdbListFilters = Record<string, string | number | boolean | undefined>;

export function createTmdbListFetcher(path: string) {
  return async (page: number, filters?: TmdbListFilters) => {
    const url = new URL(path, window.location.origin);
    url.searchParams.set("page", String(page));
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === "" || value === false) continue;
        url.searchParams.set(key, String(value));
      }
    }
    const res = await fetch(url.toString(), { credentials: "include" });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  };
}
