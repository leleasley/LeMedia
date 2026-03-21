"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )lemedia_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function ForgotPasswordForm({ csrfToken }: { csrfToken?: string }) {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [csrf, setCsrf] = useState(csrfToken ?? "");

  useEffect(() => {
    if (!csrf) {
      const fromCookie = getCsrfToken();
      if (fromCookie) {
        setCsrf(fromCookie);
        return;
      }
      fetch("/api/v1/csrf", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          const t = (d as { token?: string } | null)?.token || getCsrfToken();
          if (t) setCsrf(t);
        })
        .catch(() => undefined);
    }
  }, [csrf]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError("");
      setLoading(true);
      try {
        const res = await fetch("/api/v1/auth/forgot-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, csrf_token: csrf }),
          credentials: "include",
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok && data.error) {
          setError(data.error);
        } else {
          setSubmitted(true);
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [email, csrf]
  );

  if (submitted) {
    return (
      <div className="space-y-6 text-center">
        <div className="flex items-center justify-center w-14 h-14 mx-auto rounded-full bg-white/10">
          <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Check your email</h2>
          <p className="mt-2 text-sm text-gray-400 leading-relaxed">
            If that email address is registered, a password reset link has been sent. The link expires in 15 minutes and can only be used once.
          </p>
        </div>
        <Link
          href="/login"
          className="inline-block text-sm text-gray-400 hover:text-white transition"
        >
          ← Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div className="space-y-1.5">
        <label
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1"
          htmlFor="fp-email"
        >
          Email address
        </label>
        <input
          id="fp-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !email}
        className="w-full mt-2 bg-white text-black hover:bg-gray-100 py-3.5 text-sm font-bold uppercase tracking-wide rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {loading ? "Sending…" : "Send Reset Link"}
      </button>

      <div className="mt-4 pt-4 border-t border-white/10 flex justify-center">
        <Link href="/login" className="text-[10px] text-gray-400 hover:text-gray-300 transition">
          ← Back to sign in
        </Link>
      </div>
    </form>
  );
}
