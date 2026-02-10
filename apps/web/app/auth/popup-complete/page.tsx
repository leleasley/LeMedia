"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

function sanitizeFrom(value: string | null): string {
  if (!value) return "/";
  if (value.startsWith("http")) return "/";
  if (value.startsWith("//") || value.startsWith("\\\\")) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

export default function PopupCompletePage() {
  const params = useSearchParams();

  useEffect(() => {
    const from = sanitizeFrom(params.get("from"));
    const payload = { type: "lemedia:sso-complete", redirect: from };

    let closed = false;

    if (window.opener && !window.opener.closed) {
      try {
        window.opener.postMessage(payload, window.location.origin);
      } catch {
        // Ignore cross-window failures.
      }
    }

    try {
      window.close();
    } catch {
      // Some browsers may not allow closing opened in same context
    }

    const timer = window.setTimeout(() => {
      if (!closed) {
        window.location.href = from;
      }
    }, 300);

    const unloadHandler = () => {
      closed = true;
      window.clearTimeout(timer);
    };

    window.addEventListener("unload", unloadHandler);

    return () => {
      window.removeEventListener("unload", unloadHandler);
      window.clearTimeout(timer);
    };
  }, [params]);

  return (
    <main className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center space-y-2">
        <h1 className="text-lg font-semibold">Signing you in...</h1>
        <p className="text-sm text-gray-400">You can close this window if it does not close automatically.</p>
      </div>
    </main>
  );
}
