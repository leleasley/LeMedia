"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";

export function MFAResetModal() {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [password, setPassword] = useState("");
    const toast = useToast();

    async function handleReset() {
        if (!password) {
            toast.error("Enter your current password");
            return;
        }
        setIsLoading(true);
        try {
            const res = await csrfFetch("/api/v1/profile/mfa/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password })
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body?.error || "Failed to reset MFA");
            }
            // The API will redirect, but we can show a message in case
            toast.success("MFA reset initiated. Redirecting to setup...");
            setPassword("");
            // Let the redirect happen
            window.location.href = res.url || "/mfa_setup";
        } catch (err: any) {
            const msg = err?.message ?? "MFA reset failed";
            toast.error(msg);
            setIsLoading(false);
        }
    }

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-100 text-sm font-semibold transition-colors disabled:opacity-50"
            >
                {isLoading ? (
                    <>
                        <Loader2 className="inline mr-2 h-4 w-4 animate-spin" />
                        Resetting...
                    </>
                ) : (
                    "Reset MFA"
                )}
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="rounded-2xl glass-strong border border-white/10 p-6 md:p-8 shadow-2xl max-w-sm w-full mx-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-500/20">
                                <span className="text-lg">⚠️</span>
                            </div>
                            <h3 className="text-lg font-bold text-white">Reset MFA?</h3>
                        </div>

                        <p className="text-sm text-gray-300 mb-6">
                            You will be signed out and taken to set up MFA again. Make sure you have your authenticator app ready.
                        </p>
                        <label className="block text-sm text-gray-300 mb-2" htmlFor="mfa-reset-password">
                            Current password
                        </label>
                        <input
                            id="mfa-reset-password"
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40 mb-6"
                            placeholder="Enter your password"
                        />

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    setPassword("");
                                }}
                                disabled={isLoading}
                                className="px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/5 text-sm font-semibold transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReset}
                                disabled={isLoading}
                                className="px-4 py-2 rounded-lg bg-white text-black hover:bg-gray-100 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                Reset MFA
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
