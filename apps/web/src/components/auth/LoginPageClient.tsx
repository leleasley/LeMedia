"use client";

import Image from "next/image";
import Link from "next/link";
import useSWR from "swr";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { LoginForm } from "@/components/auth/LoginForm";
import { SessionResetModal } from "@/components/auth/SessionResetModal";
import { ImageFader } from "@/components/Common/ImageFader";
import { Modal } from "@/components/Common/Modal";
import { startAuthentication } from "@simplewebauthn/browser";
import { ChevronDown, Fingerprint, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { logger } from "@/lib/logger";
import { useToast } from "@/components/Providers/ToastProvider";

type LoginPageClientProps = {
  csrfToken?: string;
  from: string;
  oidcEnabled: boolean;
  jellyfinEnabled: boolean;
  googleOauthEnabled?: boolean;
  githubOauthEnabled?: boolean;
  ssoProviderType?: "oidc" | "duo_websdk";
};

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((res) => res.json());

const loginFormId = "lemedia-login-form";
const ssoPopupName = "lemedia-sso";
const ssoPopupIntervalMs = 1000;
const ssoPopupMaxMs = 2 * 60 * 1000;

function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isStandaloneDisplayMode(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const isStandalone = (navigator as { standalone?: boolean }).standalone === true;
  const matchMedia = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  return Boolean(isStandalone || matchMedia);
}

function openSsoPopup(url: string) {
  const width = 520;
  const height = 720;
  const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
  return window.open(url, ssoPopupName, features);
}

export function LoginPageClient({
  csrfToken,
  from,
  oidcEnabled,
  jellyfinEnabled,
  googleOauthEnabled = false,
  githubOauthEnabled = false,
  ssoProviderType
}: LoginPageClientProps) {
  const router = useRouter();
  const toast = useToast();
  const ssoPopupRef = useRef<Window | null>(null);
  const ssoPopupTimerRef = useRef<number | null>(null);
  const [showJellyfinLogin, setShowJellyfinLogin] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [showDuoModal, setShowDuoModal] = useState(false);
  const [duoUsername, setDuoUsername] = useState("");
  const [redirectingToSso, setRedirectingToSso] = useState(false);
  const [ssoPopupActive, setSsoPopupActive] = useState(false);
  const isTurnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const { data: backdrops } = useSWR<string[]>("/api/v1/backdrops", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });

  const handlePasskeyLogin = async () => {
    if (isTurnstileEnabled && !turnstileToken) {
      toast.error("Complete the security check before signing in.");
      return;
    }
    try {
      const optionsRes = await fetch("/api/auth/webauthn/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnstileToken })
      });
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
      logger.error("Passkey login failed", err);
      toast.error("Passkey login failed. Please try your password.");
    }
  };

  const backgroundImages = Array.isArray(backdrops)
    ? backdrops.map((path) => `https://image.tmdb.org/t/p/w1280${path}`)
    : [];

  const redirectToSso = (url: string) => {
    setRedirectingToSso(true);
    window.location.href = url;
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; redirect?: string } | null;
      if (!data || data.type !== "lemedia:sso-complete") return;
      if (ssoPopupTimerRef.current) {
        window.clearInterval(ssoPopupTimerRef.current);
        ssoPopupTimerRef.current = null;
      }
      if (ssoPopupRef.current && !ssoPopupRef.current.closed) {
        ssoPopupRef.current.close();
      }
      ssoPopupRef.current = null;
      setSsoPopupActive(false);
      router.replace(data.redirect || from || "/");
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [from, router]);

  const startSsoFlow = async (url: string) => {
    if (isMobileUserAgent() || isStandaloneDisplayMode()) {
      redirectToSso(url);
      return;
    }

    const popupUrl = `${url}${url.includes("?") ? "&" : "?"}popup=1`;
    const popup = openSsoPopup(popupUrl);
    if (!popup) {
      toast.error("Popup blocked. Allow popups and try again.");
      redirectToSso(url);
      return;
    }
    ssoPopupRef.current = popup;
    setSsoPopupActive(true);
    if (ssoPopupTimerRef.current) {
      window.clearInterval(ssoPopupTimerRef.current);
      ssoPopupTimerRef.current = null;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(async () => {
      try {
        if (ssoPopupRef.current && ssoPopupRef.current.closed) {
          window.clearInterval(timer);
          ssoPopupTimerRef.current = null;
          setSsoPopupActive(false);
          return;
        }

        const res = await fetch("/api/v1/auth/me", { credentials: "include" });
        if (res.ok) {
          window.clearInterval(timer);
          ssoPopupTimerRef.current = null;
          if (ssoPopupRef.current && !ssoPopupRef.current.closed) {
            ssoPopupRef.current.close();
          }
          ssoPopupRef.current = null;
          setSsoPopupActive(false);
          router.replace(from || "/");
          return;
        }

        if (Date.now() - startedAt > ssoPopupMaxMs) {
          window.clearInterval(timer);
          ssoPopupTimerRef.current = null;
          if (ssoPopupRef.current && !ssoPopupRef.current.closed) {
            ssoPopupRef.current.close();
          }
          ssoPopupRef.current = null;
          setSsoPopupActive(false);
          toast.error("SSO timed out. Try again.");
        }
      } catch (err) {
        logger.warn("SSO popup polling failed", { error: err instanceof Error ? err.message : String(err) });
      }
    }, ssoPopupIntervalMs);
    ssoPopupTimerRef.current = timer;
  };

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
                onTurnstileTokenChange={setTurnstileToken}
              />
            </>
          ) : (
            <>
              <div className="mb-6 text-center">
                <div className="text-2xl font-semibold text-white">Sign In</div>
                <p className="mt-1 text-sm text-gray-400">Sign in to continue</p>
              </div>

              <LoginForm
                from={from}
                csrfToken={csrfToken}
                formId={loginFormId}
                onTurnstileTokenChange={setTurnstileToken}
              />

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
                      disabled={isTurnstileEnabled && !turnstileToken}
                      className={`cursor-pointer gap-2 px-3 py-2 text-sm ${isTurnstileEnabled && !turnstileToken ? "opacity-50" : ""}`}
                    >
                      <Fingerprint className="h-4 w-4 text-gray-200" />
                      Sign in with Passkey
                    </DropdownMenuItem>
                    {oidcEnabled ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          if (isTurnstileEnabled && !turnstileToken) return;
                          if (ssoProviderType === "duo_websdk") {
                            setShowDuoModal(true);
                            return;
                          }
                          startSsoFlow(`/api/v1/auth/oidc/login?from=${encodeURIComponent(from)}&turnstile_token=${encodeURIComponent(turnstileToken)}`);
                        }}
                        disabled={isTurnstileEnabled && !turnstileToken}
                        className={`cursor-pointer gap-2 px-3 py-2 text-sm ${isTurnstileEnabled && !turnstileToken ? "opacity-50" : ""}`}
                      >
                        <KeyRound className="h-4 w-4 text-gray-200" />
                        Sign in with SSO
                      </DropdownMenuItem>
                    ) : null}
                    {jellyfinEnabled ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          if (isTurnstileEnabled && !turnstileToken) return;
                          setShowJellyfinLogin(true);
                        }}
                        disabled={isTurnstileEnabled && !turnstileToken}
                        className={`cursor-pointer gap-2 px-3 py-2 text-sm ${isTurnstileEnabled && !turnstileToken ? "opacity-50" : ""}`}
                      >
                        <Image src="/images/jellyfin.svg" alt="Jellyfin" width={16} height={16} />
                        Sign in with Jellyfin
                      </DropdownMenuItem>
                    ) : null}
                    {googleOauthEnabled ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          if (isTurnstileEnabled && !turnstileToken) return;
                          redirectToSso(`/api/v1/auth/oauth/google/start?from=${encodeURIComponent(from)}&turnstile_token=${encodeURIComponent(turnstileToken)}`);
                        }}
                        disabled={isTurnstileEnabled && !turnstileToken}
                        className={`cursor-pointer gap-2 px-3 py-2 text-sm ${isTurnstileEnabled && !turnstileToken ? "opacity-50" : ""}`}
                      >
                        <Image src="/google-login.svg" alt="Google" width={16} height={16} />
                        Continue with Google
                      </DropdownMenuItem>
                    ) : null}
                    {githubOauthEnabled ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          if (isTurnstileEnabled && !turnstileToken) return;
                          redirectToSso(`/api/v1/auth/oauth/github/start?from=${encodeURIComponent(from)}&turnstile_token=${encodeURIComponent(turnstileToken)}`);
                        }}
                        disabled={isTurnstileEnabled && !turnstileToken}
                        className={`cursor-pointer gap-2 px-3 py-2 text-sm ${isTurnstileEnabled && !turnstileToken ? "opacity-50" : ""}`}
                      >
                        <Image src="/github-login.svg" alt="GitHub" width={16} height={16} />
                        Continue with GitHub
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Modal
                open={showDuoModal}
                title="Duo sign-in"
                onClose={() => setShowDuoModal(false)}
                forceCenter
              >
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const username = duoUsername.trim();
                    if (!username) {
                      toast.error("Enter your Duo username to continue.");
                      return;
                    }
                    startSsoFlow(`/api/v1/auth/duo/login?from=${encodeURIComponent(from)}&turnstile_token=${encodeURIComponent(turnstileToken)}&username=${encodeURIComponent(username)}`);
                  }}
                >
                  <div className="space-y-1 text-sm">
                    <label className="font-semibold text-white">Username or email</label>
                    <input
                      className="w-full input"
                      placeholder="you@example.com"
                      value={duoUsername}
                      onChange={(e) => setDuoUsername(e.target.value)}
                    />
                    <p className="text-xs text-muted">Use the same username registered in Duo.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="btn" onClick={() => setShowDuoModal(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Continue
                    </button>
                  </div>
                </form>
              </Modal>
              <Modal
                open={redirectingToSso}
                title="Redirecting to SSO"
                onClose={() => setRedirectingToSso(false)}
                forceCenter
              >
                <div className="space-y-2 text-sm text-muted">
                  <p>Taking you to your identity provider to finish sign-in.</p>
                  <p>If nothing happens, disable pop-up blockers and try again.</p>
                </div>
              </Modal>
              <Modal
                open={ssoPopupActive}
                title="Complete sign-in"
                onClose={() => setSsoPopupActive(false)}
                forceCenter
              >
                <div className="space-y-2 text-sm text-muted">
                  <p>Finish signing in in the popup window.</p>
                  <p>If you closed it by mistake, try again.</p>
                </div>
              </Modal>
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
