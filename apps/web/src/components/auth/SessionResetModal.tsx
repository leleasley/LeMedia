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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-300">
      {/* Outer wrapper for animated gradient border */}
      <div className="relative w-full max-w-md animate-in zoom-in-95 fade-in duration-300">
        {/* Animated gradient border glow */}
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 opacity-60 blur-sm animate-pulse" />
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 opacity-30" />
        
        {/* Main modal container */}
        <div className="relative w-full rounded-2xl bg-gradient-to-b from-gray-900/95 via-gray-900/98 to-gray-950 border border-white/10 shadow-[0_0_50px_rgba(59,130,246,0.15)] backdrop-blur-2xl overflow-hidden p-6 text-center">
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-xl bg-blue-500 opacity-20 blur-lg mx-auto w-fit" />
            <div className="relative mx-auto w-fit rounded-xl p-3 bg-blue-500/10 border border-blue-500/20">
              <svg className="h-6 w-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-semibold text-white">Session reset required</h2>
          <p className="mt-3 text-sm text-gray-400 leading-relaxed">
            Your session has been refreshed for security. Click continue to clear local session data and sign in again.
          </p>
          <button 
            className="mt-6 w-full rounded-xl px-5 py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-lg shadow-blue-500/25 transition-all duration-200" 
            onClick={onContinue}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
