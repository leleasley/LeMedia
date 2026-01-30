"use client";

import { useState, useEffect, useCallback } from "react";
import { CsrfTokenInput } from "@/components/Common/CsrfTokenInput";
import { TurnstileWidget } from "@/components/Common/TurnstileWidget";

interface MfaSetupFormProps {
  csrfToken?: string;
}

export function MfaSetupForm({ csrfToken }: MfaSetupFormProps) {
  const [turnstileToken, setTurnstileToken] = useState<string>("");
  const [mounted, setMounted] = useState(false);
  const isTurnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  useEffect(() => {
    if (mounted) return;
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, [mounted]);

  const handleTurnstileSuccess = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleTurnstileError = useCallback(() => {
    setTurnstileToken("");
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    setTurnstileToken("");
  }, []);

  return (
    <form className="space-y-6" method="post" action="/api/v1/mfa/setup">
      <CsrfTokenInput value={csrfToken} />
      {mounted && isTurnstileEnabled && (
        <input type="hidden" name="turnstile_token" value={turnstileToken} />
      )}
      <div className="space-y-2">
        <label className="text-sm font-medium block" htmlFor="code">
          Verification code
        </label>
        <input
          className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/20 backdrop-blur-md focus:border-white/40 focus:ring-4 focus:ring-white/20 outline-none transition-all"
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          maxLength={6}
          placeholder="123456"
        />
      </div>
      {mounted && isTurnstileEnabled && (
        <div className="pt-2">
          <TurnstileWidget
            onSuccess={handleTurnstileSuccess}
            onError={handleTurnstileError}
            onExpire={handleTurnstileExpire}
          />
        </div>
      )}
      <button
        type="submit"
        disabled={mounted && isTurnstileEnabled && !turnstileToken}
        className="w-full btn-primary py-3 text-lg font-semibold rounded-xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        Activate MFA
      </button>
    </form>
  );
}
