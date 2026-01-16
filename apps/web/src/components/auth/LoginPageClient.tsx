"use client";

import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { LoginForm } from "@/components/auth/LoginForm";
import { SessionResetModal } from "@/components/auth/SessionResetModal";
import { ImageFader } from "@/components/Common/ImageFader";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";

type LoginPageClientProps = {
  csrfToken?: string;
  from: string;
  oidcEnabled: boolean;
};

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((res) => res.json());

export function LoginPageClient({ csrfToken, from, oidcEnabled }: LoginPageClientProps) {
  const router = useRouter();
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
    ? backdrops.map((path) => `https://image.tmdb.org/t/p/original${path}`)
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
          <div className="mb-6 text-center">
            <div className="text-2xl font-semibold text-white">Sign In</div>
            <p className="mt-1 text-sm text-gray-400">Sign in to continue</p>
          </div>

          <LoginForm from={from} csrfToken={csrfToken} />

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs uppercase tracking-[0.3em] text-gray-500">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <button
            onClick={handlePasskeyLogin}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition mb-4"
          >
            <Fingerprint className="w-4 h-4" />
            Sign in with Passkey
          </button>

          {oidcEnabled ? (
            <a
              className="w-full inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
              href={`/api/v1/auth/oidc/login?from=${encodeURIComponent(from)}`}
            >
              Sign in with SSO
            </a>
          ) : null}
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
