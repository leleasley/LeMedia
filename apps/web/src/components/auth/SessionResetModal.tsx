"use client";

import { useState } from "react";

const COOKIE_NAMES = [
  "lemedia_session",
  "lemedia_user",
  "lemedia_groups",
  "lemedia_expires",
  "lemedia_login_redirect",
  "lemedia_mfa_token",
  "lemedia_force_login",
  "lemedia_csrf",
  "lemedia_oidc_state",
  "lemedia_oidc_nonce",
  "lemedia_oidc_provider",
  "lemedia_duo_state",
  "lemedia_duo_username",
  "lemedia_duo_provider",
  "lemedia_session_reset"
];

function getCookieValue(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function deleteCookie(name: string) {
  const base = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  document.cookie = base;
  const host = window.location.hostname;
  document.cookie = `${base}; domain=${host}`;
}

export function SessionResetModal() {
  const [open] = useState(() => getCookieValue("lemedia_session_reset") === "1");

  if (!open) return null;

  const onContinue = () => {
    COOKIE_NAMES.forEach(deleteCookie);
    window.location.assign("/logout");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-background/95 p-6 text-center shadow-2xl">
        <h2 className="text-xl font-semibold text-white">Session reset required</h2>
        <p className="mt-3 text-sm text-muted">
          Your session has been refreshed for security. Click continue to clear local session data and sign in again.
        </p>
        <button className="btn mt-6 w-full" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
