"use client";

import { useEffect, useState } from "react";

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function CsrfTokenInput({ value }: { value?: string }) {
  const [token, setToken] = useState(() => value || getCookieValue("lemedia_csrf") || "");

  useEffect(() => {
    if (token) return;
    let active = true;
    fetch("/api/v1/csrf", { credentials: "include" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!active) return;
        const next = (data as { token?: string } | null)?.token || getCookieValue("lemedia_csrf") || "";
        if (next) setToken(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  return <input type="hidden" name="csrf_token" value={token} />;
}
