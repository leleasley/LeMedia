"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { CsrfTokenInput } from "@/components/Common/CsrfTokenInput";
import { TurnstileWidget } from "@/components/Common/TurnstileWidget";

interface LoginFormProps {
    from: string;
    csrfToken?: string;
    formId?: string;
    action?: string;
    submitLabel?: string;
    onTurnstileTokenChange?: (token: string) => void;
}

export function LoginForm({
    from,
    csrfToken,
    formId,
    action = "/api/v1/login",
    submitLabel = "Sign In",
    onTurnstileTokenChange
}: LoginFormProps) {
    const searchParams = useSearchParams();
    const toast = useToast();
    const [turnstileToken, setTurnstileToken] = useState<string>("");
    const [mounted, setMounted] = useState(false);
    const [inlineError, setInlineError] = useState<string | null>(null);
    const isTurnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

    useEffect(() => {
        if (mounted) return;
        const id = window.requestAnimationFrame(() => setMounted(true));
        return () => window.cancelAnimationFrame(id);
    }, [mounted]);

    useEffect(() => {
        const error = searchParams.get("error");
        const success = searchParams.get("success");

        if (error) {
            setInlineError(error);
        }
        if (success) {
            toast.success(success);
        }
    }, [searchParams, toast]);

    const handleTurnstileSuccess = useCallback((token: string) => {
        setTurnstileToken(token);
        onTurnstileTokenChange?.(token);
    }, [onTurnstileTokenChange]);

    const handleTurnstileError = useCallback(() => {
        setTurnstileToken("");
        onTurnstileTokenChange?.("");
    }, [onTurnstileTokenChange]);

    const handleTurnstileExpire = useCallback(() => {
        setTurnstileToken("");
        onTurnstileTokenChange?.("");
    }, [onTurnstileTokenChange]);

    return (
        <form id={formId} className="space-y-5" method="post" action={action}>
            <input type="hidden" name="from" value={from} />
            <CsrfTokenInput value={csrfToken} />
            {mounted && isTurnstileEnabled && (
                <input type="hidden" name="turnstile_token" value={turnstileToken} />
            )}
            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1" htmlFor="username">
                    Username
                </label>
                <input
                    className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
                    id="username"
                    name="username"
                    required
                    placeholder="Enter your username"
                    autoComplete="username"
                    autoFocus
                    onChange={() => setInlineError(null)}
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1" htmlFor="password">
                    Password
                </label>
                <input
                    className={`w-full px-4 py-3 rounded-lg bg-black/20 border text-white placeholder:text-gray-500 focus:bg-black/40 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200 ${
                        inlineError ? "border-red-500/60 focus:border-red-500/60" : "border-white/10 focus:border-white/20"
                    }`}
                    id="password"
                    type="password"
                    name="password"
                    required
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    onChange={() => setInlineError(null)}
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

            {inlineError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-300">
                    <svg className="h-4 w-4 shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                    </svg>
                    {inlineError}
                </div>
            )}

            <button
                type="submit"
                disabled={mounted && isTurnstileEnabled && !turnstileToken}
                className="w-full mt-2 bg-white text-black hover:bg-gray-100 py-3.5 text-sm font-bold uppercase tracking-wide rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
                {submitLabel}
            </button>

            <div className="mt-4 pt-4 border-t border-white/10 flex justify-center gap-3 text-[10px]">
                <Link href="/forgot-password" className="text-gray-400 hover:text-gray-300 transition">
                    Forgot Password?
                </Link>
                <span className="text-gray-600">·</span>
                <Link href="/privacy" className="text-gray-400 hover:text-gray-300 transition">
                    Privacy
                </Link>
                <span className="text-gray-600">·</span>
                <Link href="/cookies" className="text-gray-400 hover:text-gray-300 transition">
                    Cookies
                </Link>
                <span className="text-gray-600">·</span>
                <span className="text-gray-500">© leleasley</span>
            </div>
        </form>
    );
}
