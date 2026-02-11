"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { TurnstileWidget } from "@/components/Common/TurnstileWidget";
import { Film, Bell, Download, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { PasswordPolicyChecklist } from "@/components/Common/PasswordPolicyChecklist";
import { getPasswordPolicyResult } from "@/lib/password-policy";

type Step = "welcome" | "create-admin";

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
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

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const policy = getPasswordPolicyResult({ password: formData.password, username: formData.username });
    if (policy.errors.length) {
      setError(policy.errors[0]);
      return;
    }

    if (isTurnstileEnabled && !turnstileToken) {
      setError("Please complete the verification challenge");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          turnstileToken,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to create account");
        return;
      }

      // Success - redirect to login
      router.push("/login");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-auto bg-gray-900 px-4 py-6 sm:py-12">
      <div className="absolute top-4 right-4 z-50">
        <ModeToggle />
      </div>

      <div className="relative z-10 w-full max-w-[520px]">
        {/* Logo */}
        <div className="relative z-40 flex flex-col items-center px-4 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="relative h-32 sm:h-40 w-full max-w-full">
            <Image src="/login-logo.png" alt="LeMedia Logo" fill className="object-contain" priority />
          </div>
        </div>

        {step === "welcome" && (
          <div
            className="mt-6 rounded-lg bg-gray-800/50 p-6 sm:p-8 shadow-lg"
            style={{ backdropFilter: "blur(5px)" }}
          >
            <div className="text-center mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">Welcome to LeMedia</h1>
              <p className="text-gray-400">Your personal media request system</p>
            </div>

            <div className="space-y-4 text-gray-300 mb-8">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <Film className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <div className="font-medium text-white">Request Movies & TV Shows</div>
                  <div className="text-sm text-gray-400">Browse and request content from TMDB&apos;s extensive library</div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <Download className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <div className="font-medium text-white">Automatic Processing</div>
                  <div className="text-sm text-gray-400">Integrates with Sonarr & Radarr for automatic downloads</div>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <div className="font-medium text-white">Stay Notified</div>
                  <div className="text-sm text-gray-400">Get updates when your requests become available</div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep("create-admin")}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 text-sm font-semibold uppercase tracking-wide rounded-lg shadow-lg transition-all duration-200"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === "create-admin" && (
          <div
            className="mt-6 rounded-lg bg-gray-800/50 p-6 sm:p-8 shadow-lg"
            style={{ backdropFilter: "blur(5px)" }}
          >
            <div className="text-center mb-6">
              <h1 className="text-xl sm:text-2xl font-bold text-white mb-2">Create Administrator</h1>
              <p className="text-sm text-gray-400">Set up your admin account to get started</p>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleCreateAdmin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1" htmlFor="username">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  required
                  minLength={3}
                  maxLength={50}
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder:text-gray-500 focus:bg-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all duration-200"
                  placeholder="admin"
                  autoComplete="username"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder:text-gray-500 focus:bg-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all duration-200"
                  placeholder="admin@example.com"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1" htmlFor="password">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder:text-gray-500 focus:bg-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all duration-200"
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                />
                <PasswordPolicyChecklist
                  password={formData.password}
                  username={formData.username}
                  className="mt-3"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1" htmlFor="confirmPassword">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  className="w-full px-4 py-3 rounded-lg bg-gray-900/50 border border-gray-700 text-white placeholder:text-gray-500 focus:bg-gray-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all duration-200"
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                />
              </div>

              {mounted && isTurnstileEnabled && (
                <div className="pt-1">
                  <TurnstileWidget
                    onSuccess={handleTurnstileSuccess}
                    onError={handleTurnstileError}
                    onExpire={handleTurnstileExpire}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep("welcome")}
                  className="flex-1 flex items-center justify-center gap-2 bg-transparent text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 py-3 text-sm font-semibold uppercase tracking-wide rounded-lg transition-all duration-200"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || (mounted && isTurnstileEnabled && !turnstileToken)}
                  className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 text-sm font-semibold uppercase tracking-wide rounded-lg shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-indigo-600"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
