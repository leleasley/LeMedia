"use client";

import { useEffect, useRef, useState } from "react";

type SharePasswordGateProps = {
  shareId: number;
};

export function SharePasswordGate({ shareId }: SharePasswordGateProps) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim()) {
      setError("Password is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/share/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: shareId, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Invalid password");
      }
      window.location.reload();
    } catch (err: any) {
      setError(err?.message || "Invalid password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-2xl font-bold text-white mb-2">Password Required</h1>
          <p className="text-gray-400 mb-6">
            This share link is protected. Enter the password to continue.
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="share-password" className="block text-sm font-medium text-gray-300 mb-2">
                Password
              </label>
              <input
                id="share-password"
                ref={inputRef}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-lg border border-gray-700 bg-slate-800 px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-indigo-600 px-4 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-indigo-600/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
            >
              {submitting ? "Checking..." : "Unlock Share"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
