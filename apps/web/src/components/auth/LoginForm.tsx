"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useToast } from "@/components/Providers/ToastProvider";
import { CsrfTokenInput } from "@/components/Common/CsrfTokenInput";

interface LoginFormProps {
    from: string;
    csrfToken?: string;
}

export function LoginForm({ from, csrfToken }: LoginFormProps) {
    const searchParams = useSearchParams();
    const toast = useToast();

    useEffect(() => {
        const error = searchParams.get("error");
        const success = searchParams.get("success");

        if (error) {
            toast.error(error);
        }
        if (success) {
            toast.success(success);
        }
    }, [searchParams, toast]);

    return (
        <form className="space-y-5" method="post" action="/api/v1/login">
            <input type="hidden" name="from" value={from} />
            <CsrfTokenInput value={csrfToken} />
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
                />
            </div>

            <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider ml-1" htmlFor="password">
                    Password
                </label>
                <input
                    className="w-full px-4 py-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-gray-500 focus:bg-black/40 focus:border-white/20 focus:ring-2 focus:ring-white/10 outline-none transition-all duration-200"
                    id="password"
                    type="password"
                    name="password"
                    required
                    placeholder="Enter your password"
                    autoComplete="current-password"
                />
            </div>

            <button
                type="submit"
                className="w-full mt-2 bg-white text-black hover:bg-gray-100 py-3.5 text-sm font-bold uppercase tracking-wide rounded-lg shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
            >
                Sign In
            </button>
        </form>
    );
}
