"use client";

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function isUnsafeMethod(method?: string) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes((method || "GET").toUpperCase());
}

export function csrfFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  if (isUnsafeMethod(init.method)) {
    const token = getCookieValue("lemedia_csrf");
    if (token) {
      headers.set("x-csrf-token", token);
    }
  }
  const credentials = init.credentials ?? "include";
  return fetch(input, { ...init, credentials, headers });
}
