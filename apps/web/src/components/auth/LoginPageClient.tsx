"use client";

import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { LoginForm } from "@/components/auth/LoginForm";
import { SessionResetModal } from "@/components/auth/SessionResetModal";
import { ImageFader } from "@/components/Common/ImageFader";
import { startAuthentication } from "@simplewebauthn/browser";
import { ChevronDown, Fingerprint, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type LoginPageClientProps = {
  csrfToken?: string;
  from: string;
  oidcEnabled: boolean;
  jellyfinEnabled: boolean;
};

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((res) => res.json());

const loginFormId = "lemedia-login-form";

export function LoginPageClient({ csrfToken, from, oidcEnabled, jellyfinEnabled }: LoginPageClientProps) {
  const router = useRouter();
  const [showJellyfinLogin, setShowJellyfinLogin] = useState(false);
  const { data: backdrops } = useSWR<string[]>("/api/v1/backdrops", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });

  const handlePasskeyLogin = async () => {
    try {
      const optionsRes = await fetch("/api/auth/webauthn/login/options");
      if (!optionsRes.ok) throw new Error("Failed to get login options");
      const options = await optionsRes.json();

      const asseResp = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asseResp),
      });

      const verification = await verifyRes.json();
      if (verification.verified) {
        window.location.href = from || "/";
      } else {
        throw new Error(verification.error || "Verification failed");
      }
    } catch (err) {
      console.error(err);
      alert("Passkey login failed. Please try your password.");
    }
  };

  const backgroundImages = Array.isArray(backdrops)
    ? backdrops.map((path) => `https://image.tmdb.org/t/p/w1280${path}`)
    : [];

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-auto bg-gray-900 px-4 py-6 sm:py-12">
      <SessionResetModal />
      <ImageFader backgroundImages={backgroundImages} className="absolute inset-0 z-0" />

      <div className="absolute top-4 right-4 z-50">
        <ModeToggle />
      </div>

      <div className="relative z-10 w-full max-w-[460px]">
        <div className="relative z-40 mt-4 sm:mt-10 flex flex-col items-center px-4 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="relative h-32 sm:h-48 w-full max-w-full">
            <Image src="/login-logo.png" alt="LeMedia Logo" fill className="object-contain" priority />
          </div>
        </div>

        <div
          className="mt-4 sm:mt-8 rounded-lg bg-gray-800/50 p-6 sm:p-8 shadow-lg sm:mx-auto sm:w-full sm:max-w-md md:p-10"
          style={{ backdropFilter: "blur(5px)" }}
        >
          {showJellyfinLogin ? (
            <>
              <div className="mb-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowJellyfinLogin(false)}
                  className="text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-white transition"
                >
                  Back
                </button>
                <div className="text-2xl font-semibold text-white text-center flex-1">Sign in with Jellyfin</div>
                <div className="w-12" />
              </div>

              <LoginForm
                from={from}
                csrfToken={csrfToken}
                action="/api/v1/login/jellyfin"
                submitLabel="Sign in with Jellyfin"
              />
            </>
          ) : (
            <>
              <div className="mb-6 text-center">
                <div className="text-2xl font-semibold text-white">Sign In</div>
                <p className="mt-1 text-sm text-gray-400">Sign in to continue</p>
              </div>

              <LoginForm from={from} csrfToken={csrfToken} formId={loginFormId} />

              <div className="mt-6 flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-white transition"
                    >
                      Other sign-in methods
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="center"
                    className="min-w-[240px] p-2 !bg-gray-900/95 !backdrop-blur-none border border-white/10"
                  >
                    <DropdownMenuItem
                      onSelect={() => handlePasskeyLogin()}
                      className="cursor-pointer gap-2 px-3 py-2 text-sm"
                    >
                      <Fingerprint className="h-4 w-4 text-gray-200" />
                      Sign in with Passkey
                    </DropdownMenuItem>
                    {oidcEnabled ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          window.location.href = `/api/v1/auth/oidc/login?from=${encodeURIComponent(from)}`;
                        }}
                        className="cursor-pointer gap-2 px-3 py-2 text-sm"
                      >
                        <KeyRound className="h-4 w-4 text-gray-200" />
                        Sign in with SSO
                      </DropdownMenuItem>
                    ) : null}
                    {jellyfinEnabled ? (
                      <DropdownMenuItem
                        onSelect={() => setShowJellyfinLogin(true)}
                        className="cursor-pointer gap-2 px-3 py-2 text-sm"
                      >
                        <Image src="/images/jellyfin.svg" alt="Jellyfin" width={16} height={16} />
                        Sign in with Jellyfin
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link className="text-xs text-gray-400 hover:text-white transition-colors" href="/support">
            Forgot your password?
          </Link>
        </div>
      </div>
    </main>
  );
}
