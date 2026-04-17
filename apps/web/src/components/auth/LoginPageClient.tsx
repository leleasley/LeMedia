"use client";

import Image from "next/image";
import useSWR from "swr";
import { LoginForm } from "@/components/auth/LoginForm";
import { SessionResetModal } from "@/components/auth/SessionResetModal";
import { ImageFader } from "@/components/Common/ImageFader";
import { Modal } from "@/components/Common/Modal";
import { CookieConsentBanner } from "@/components/Common/CookieConsentBanner";
import { startAuthentication } from "@simplewebauthn/browser";
import { ChevronDown, Fingerprint, KeyRound, Loader2 } from "lucide-react";
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
  telegramOauthEnabled?: boolean;
  ssoProviderType?: "oidc" | "duo_websdk";
};

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((res) => res.json());

const loginFormId = "lemedia-login-form";
const ssoPopupName = "lemedia-sso";
const ssoPopupIntervalMs = 1000;
const ssoPopupMaxMs = 2 * 60 * 1000;
const LAST_PROVIDER_KEY = "lemedia_last_provider";

function getLastUsedProvider(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(LAST_PROVIDER_KEY); } catch { return null; }
}

function saveLastUsedProvider(provider: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(LAST_PROVIDER_KEY, provider); } catch {}
}

type ProviderButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  logo: React.ReactNode;
  label: string;
  isLastUsed?: boolean;
  loading?: boolean;
};

function ProviderButton({ onClick, disabled, logo, label, isLastUsed, loading }: ProviderButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="relative w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/25 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
    >
      <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-white/60" /> : logo}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {isLastUsed && !loading && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-full border border-indigo-400/25">
          Last used
        </span>
      )}
    </button>
  );
}

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
  telegramOauthEnabled = false,
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
  const [lastUsedProvider, setLastUsedProvider] = useState<string | null>(null);
  const [hasCheckedHistory, setHasCheckedHistory] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
  const [oauthVisibility, setOauthVisibility] = useState({
    google: googleOauthEnabled,
    github: githubOauthEnabled,
    telegram: telegramOauthEnabled
  });
  const isTurnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const { data: backdrops } = useSWR<string[]>("/api/v1/backdrops", fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage for last-used auth provider; not a data fetch
    setLastUsedProvider(getLastUsedProvider());
    setHasCheckedHistory(true);
  }, []);

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
        saveLastUsedProvider("passkey");
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

  const startOidcLogin = () => {
    if (isTurnstileEnabled && !turnstileToken) return;
    if (ssoProviderType === "duo_websdk") {
      setShowDuoModal(true);
      return;
    }
    saveLastUsedProvider("sso");
    startSsoFlow(`/api/v1/auth/oidc/login?from=${encodeURIComponent(from)}&turnstile_token=${encodeURIComponent(turnstileToken)}`);
  };

  const redirectToSso = (url: string) => {
    setRedirectingToSso(true);
    window.location.href = url;
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing OAuth visibility flags from props; not a data fetch
    setOauthVisibility({
      google: googleOauthEnabled,
      github: githubOauthEnabled,
      telegram: telegramOauthEnabled
    });
  }, [googleOauthEnabled, githubOauthEnabled, telegramOauthEnabled]);

  useEffect(() => {
    let mounted = true;

    const refreshProviders = async () => {
      try {
        const res = await fetch("/api/auth/oauth/providers", { credentials: "include", cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        const providers = data?.providers;
        if (!mounted || !providers) return;
        setOauthVisibility({
          google: Boolean(providers.google),
          github: Boolean(providers.github),
          telegram: Boolean(providers.telegram)
        });
      } catch {
      }
    };

    refreshProviders();
    const interval = window.setInterval(refreshProviders, 15000);
    window.addEventListener("focus", refreshProviders);

    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshProviders);
    };
  }, []);

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
          setLoadingProvider(null);
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
          setLoadingProvider(null);
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
          setLoadingProvider(null);
          toast.error("SSO timed out. Try again.");
        }
      } catch (err) {
        logger.warn("SSO popup polling failed", { error: err instanceof Error ? err.message : String(err) });
      }
    }, ssoPopupIntervalMs);
    ssoPopupTimerRef.current = timer;
  };

  const hasAnyProvider = oauthVisibility.google || oauthVisibility.github || oauthVisibility.telegram || oidcEnabled;

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-auto bg-gray-900 px-4 py-6">
      <SessionResetModal />
      <ImageFader backgroundImages={backgroundImages} className="absolute inset-0 z-0" />
      <CookieConsentBanner />

      <div className="relative z-10 w-full max-w-[460px]">
        {/* Logo — smaller, pushed closer to the card */}
        <div className="flex justify-center mb-3">
          <div className="relative h-14 w-32">
            <Image src="/login-logo.png" alt="LeMedia Logo" fill className="object-contain" priority />
          </div>
        </div>

        <div className="rounded-xl bg-gray-900/85 backdrop-blur-2xl border border-white/10 p-5 sm:p-6 shadow-2xl">
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
              <div className="mb-5 text-center">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {hasCheckedHistory && lastUsedProvider ? "Welcome back!" : "Sign in to LeMedia"}
                </h1>
              </div>

              {/* Third-party provider buttons */}
              {hasAnyProvider && (
                <div className="space-y-2 mb-4">
                  {oauthVisibility.google && (
                    <ProviderButton
                      onClick={() => {
                        if (isTurnstileEnabled && !turnstileToken) return;
                        saveLastUsedProvider("google");
                        setLoadingProvider("google");
                        startSsoFlow(`/api/v1/auth/oauth/google/start?from=${encodeURIComponent(from)}&turnstile_token=${encodeURIComponent(turnstileToken)}`);
                      }}
                      disabled={isTurnstileEnabled && !turnstileToken}
                      logo={<Image src="/google-login.svg" alt="Google" width={20} height={20} />}
                      label="Continue with Google"
                      isLastUsed={lastUsedProvider === "google"}
                      loading={loadingProvider === "google"}
                    />
                  )}
                  {oauthVisibility.github && (
                    <ProviderButton
                      onClick={() => {
                        if (isTurnstileEnabled && !turnstileToken) return;
                        saveLastUsedProvider("github");
                        setLoadingProvider("github");
                        startSsoFlow(`/api/v1/auth/oauth/github/start?from=${encodeURIComponent(from)}&turnstile_token=${encodeURIComponent(turnstileToken)}`);
                      }}
                      disabled={isTurnstileEnabled && !turnstileToken}
                      logo={<Image src="/github-login.svg" alt="GitHub" width={20} height={20} />}
                      label="Continue with GitHub"
                      isLastUsed={lastUsedProvider === "github"}
                      loading={loadingProvider === "github"}
                    />
                  )}
                  {oauthVisibility.telegram && (
                    <ProviderButton
                      onClick={() => {
                        if (isTurnstileEnabled && !turnstileToken) return;
                        saveLastUsedProvider("telegram");
                        setLoadingProvider("telegram");
                        startSsoFlow(`/api/v1/auth/oauth/telegram/start?from=${encodeURIComponent(from)}&turnstile_token=${encodeURIComponent(turnstileToken)}`);
                      }}
                      disabled={isTurnstileEnabled && !turnstileToken}
                      logo={<Image src="/telegram.svg" alt="Telegram" width={20} height={20} />}
                      label="Continue with Telegram"
                      isLastUsed={lastUsedProvider === "telegram"}
                      loading={loadingProvider === "telegram"}
                    />
                  )}
                  {oidcEnabled && (
                    <ProviderButton
                      onClick={() => {
                        saveLastUsedProvider("sso");
                        setLoadingProvider("sso");
                        startOidcLogin();
                      }}
                      disabled={isTurnstileEnabled && !turnstileToken}
                      logo={<KeyRound className="h-5 w-5 text-gray-300" />}
                      label="Continue with SSO"
                      isLastUsed={lastUsedProvider === "sso"}
                      loading={loadingProvider === "sso"}
                    />
                  )}
                </div>
              )}

              {/* Divider */}
              {hasAnyProvider && (
                <div className="relative flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-xs text-gray-500 uppercase tracking-wider">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              )}

              <LoginForm
                from={from}
                csrfToken={csrfToken}
                formId={loginFormId}
                onTurnstileTokenChange={setTurnstileToken}
              />

              {/* Passkey + Jellyfin */}
              <div className="mt-5 flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-white transition"
                    >
                      More options
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="center"
                    className="w-[min(22rem,calc(100vw-2rem))] min-w-0 p-2 !bg-gray-900/95 !backdrop-blur-none border border-white/10"
                  >
                    <DropdownMenuItem
                      onSelect={() => handlePasskeyLogin()}
                      disabled={isTurnstileEnabled && !turnstileToken}
                      className={`cursor-pointer gap-2 px-3 py-2 text-sm ${isTurnstileEnabled && !turnstileToken ? "opacity-50" : ""}`}
                    >
                      <Fingerprint className="h-4 w-4 text-gray-200" />
                      Sign in with Passkey
                    </DropdownMenuItem>
                    {jellyfinEnabled && (
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
                    )}
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
                    saveLastUsedProvider("sso");
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
      </div>
    </main>
  );
}
