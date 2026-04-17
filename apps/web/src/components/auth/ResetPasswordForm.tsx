"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|; )lemedia_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export function ResetPasswordForm({ csrfToken }: { csrfToken?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [csrf, setCsrf] = useState(csrfToken ?? "");

  useEffect(() => {
    if (!csrf) {
      const fromCookie = getCsrfToken();
      if (fromCookie) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- CSRF token bootstrap from cookie; not a standard data fetch
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

      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError("Passwords do not match.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/v1/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password, csrf_token: csrf }),
          credentials: "include",
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
        } else {
          router.push("/login?success=Your+password+has+been+reset.+Please+sign+in.");
        }
      } catch {
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    },
    [token, password, confirm, csrf, router]
  );

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-red-400">
          This reset link is missing or invalid. Please request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block text-sm text-gray-400 hover:text-white transition"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit} noValidate>
      <div className="space-y-1.5">
        <label
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1"
          htmlFor="rp-password"
        >
          New Password
        </label>
        <input
          id="rp-password"
          type="password"
          name="password"
          required
          autoComplete="new-password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
        />
      </div>

      <div className="space-y-1.5">
        <label
          className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1"
          htmlFor="rp-confirm"
        >
          Confirm Password
        </label>
        <input
          id="rp-confirm"
          type="password"
          name="confirm"
          required
          autoComplete="new-password"
          placeholder="Repeat your new password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400 text-center">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !password || !confirm}
        className="w-full mt-2 bg-white text-black hover:bg-gray-100 py-3.5 text-sm font-bold uppercase tracking-wide rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
      >
        {loading ? "Saving…" : "Set New Password"}
      </button>

      <div className="mt-4 pt-4 border-t border-white/10 flex justify-center gap-3 text-[10px]">
        <Link href="/login" className="text-gray-400 hover:text-gray-300 transition">
          Back to sign in
        </Link>
        <span className="text-gray-600">·</span>
        <Link href="/forgot-password" className="text-gray-400 hover:text-gray-300 transition">
          Request new link
        </Link>
      </div>
    </form>
  );
}
