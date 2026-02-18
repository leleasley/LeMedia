"use client";

import { useMemo, useState, useReducer } from "react";
import Image from "next/image";
import useSWR from "swr";
import { useToast } from "@/components/Providers/ToastProvider";
import { ConfirmModal, useConfirm } from "@/components/Common/ConfirmModal";
import { Modal } from "@/components/Common/Modal";
import { csrfFetch } from "@/lib/csrf-client";
import { usePathname } from "next/navigation";

type LinkedAccountsMode = "self" | "admin";

type AdminUser = {
  id: number;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
  jellyfinUserId: string | null;
  jellyfinUsername: string | null;
  discordUserId?: string | null;
  letterboxdUsername?: string | null;
  imdbUserId?: string | null;
  traktUsername?: string | null;
  googleLinked?: boolean;
  googleEmail?: string | null;
  githubLinked?: boolean;
  githubLogin?: string | null;
};

type ProfileResponse = {
  user: {
    username: string;
    email: string | null;
    jellyfinUserId?: string | null;
    jellyfinUsername?: string | null;
    discordUserId?: string | null;
    letterboxdUsername?: string | null;
    imdbUserId?: string | null;
    traktUsername?: string | null;
    traktLinked?: boolean;
    traktTokenExpiresAt?: string | null;
    googleLinked?: boolean;
    googleEmail?: string | null;
    githubLinked?: boolean;
    githubLogin?: string | null;
  };
};

// Reducer state and actions for managing complex UI state
type AccountsState = {
  // Jellyfin state
  unlinking: boolean;
  showLinkForm: boolean;
  linking: boolean;
  linkError: string | null;
  linkForm: { username: string; password: string };
  
  // Discord state
  editingDiscord: boolean;
  discordInput: string;
  discordValidating: boolean;
  discordError: string | null;
  discordDeleting: boolean;
  
  // Letterboxd state
  editingLetterboxd: boolean;
  letterboxdInput: string;
  letterboxdValidating: boolean;
  letterboxdError: string | null;
  letterboxdDeleting: boolean;
  letterboxdImporting: boolean;
  
  // Trakt state
  editingTrakt: boolean;
  traktInput: string;
  traktValidating: boolean;
  traktError: string | null;
  traktDeleting: boolean;
  traktConnecting: boolean;
};

type AccountsAction =
  | { type: 'SET_UNLINKING'; payload: boolean }
  | { type: 'SET_SHOW_LINK_FORM'; payload: boolean }
  | { type: 'SET_LINKING'; payload: boolean }
  | { type: 'SET_LINK_ERROR'; payload: string | null }
  | { type: 'SET_LINK_FORM'; payload: { username: string; password: string } }
  | { type: 'UPDATE_LINK_FORM_FIELD'; field: 'username' | 'password'; value: string }
  | { type: 'SET_EDITING_DISCORD'; payload: boolean }
  | { type: 'SET_DISCORD_INPUT'; payload: string }
  | { type: 'SET_DISCORD_VALIDATING'; payload: boolean }
  | { type: 'SET_DISCORD_ERROR'; payload: string | null }
  | { type: 'SET_DISCORD_DELETING'; payload: boolean }
  | { type: 'SET_EDITING_LETTERBOXD'; payload: boolean }
  | { type: 'SET_LETTERBOXD_INPUT'; payload: string }
  | { type: 'SET_LETTERBOXD_VALIDATING'; payload: boolean }
  | { type: 'SET_LETTERBOXD_ERROR'; payload: string | null }
  | { type: 'SET_LETTERBOXD_DELETING'; payload: boolean }
  | { type: 'SET_LETTERBOXD_IMPORTING'; payload: boolean }
  | { type: 'SET_EDITING_TRAKT'; payload: boolean }
  | { type: 'SET_TRAKT_INPUT'; payload: string }
  | { type: 'SET_TRAKT_VALIDATING'; payload: boolean }
  | { type: 'SET_TRAKT_ERROR'; payload: string | null }
  | { type: 'SET_TRAKT_DELETING'; payload: boolean }
  | { type: 'SET_TRAKT_CONNECTING'; payload: boolean }
  | { type: 'RESET_LINK_FORM' };

const initialState: AccountsState = {
  unlinking: false,
  showLinkForm: false,
  linking: false,
  linkError: null,
  linkForm: { username: "", password: "" },
  editingDiscord: false,
  discordInput: "",
  discordValidating: false,
  discordError: null,
  discordDeleting: false,
  editingLetterboxd: false,
  letterboxdInput: "",
  letterboxdValidating: false,
  letterboxdError: null,
  letterboxdDeleting: false,
  letterboxdImporting: false,
  editingTrakt: false,
  traktInput: "",
  traktValidating: false,
  traktError: null,
  traktDeleting: false,
  traktConnecting: false,
};

function accountsReducer(state: AccountsState, action: AccountsAction): AccountsState {
  switch (action.type) {
    case 'SET_UNLINKING':
      return { ...state, unlinking: action.payload };
    case 'SET_SHOW_LINK_FORM':
      return { ...state, showLinkForm: action.payload };
    case 'SET_LINKING':
      return { ...state, linking: action.payload };
    case 'SET_LINK_ERROR':
      return { ...state, linkError: action.payload };
    case 'SET_LINK_FORM':
      return { ...state, linkForm: action.payload };
    case 'UPDATE_LINK_FORM_FIELD':
      return { ...state, linkForm: { ...state.linkForm, [action.field]: action.value } };
    case 'SET_EDITING_DISCORD':
      return { ...state, editingDiscord: action.payload };
    case 'SET_DISCORD_INPUT':
      return { ...state, discordInput: action.payload };
    case 'SET_DISCORD_VALIDATING':
      return { ...state, discordValidating: action.payload };
    case 'SET_DISCORD_ERROR':
      return { ...state, discordError: action.payload };
    case 'SET_DISCORD_DELETING':
      return { ...state, discordDeleting: action.payload };
    case 'SET_EDITING_LETTERBOXD':
      return { ...state, editingLetterboxd: action.payload };
    case 'SET_LETTERBOXD_INPUT':
      return { ...state, letterboxdInput: action.payload };
    case 'SET_LETTERBOXD_VALIDATING':
      return { ...state, letterboxdValidating: action.payload };
    case 'SET_LETTERBOXD_ERROR':
      return { ...state, letterboxdError: action.payload };
    case 'SET_LETTERBOXD_DELETING':
      return { ...state, letterboxdDeleting: action.payload };
    case 'SET_LETTERBOXD_IMPORTING':
      return { ...state, letterboxdImporting: action.payload };
    case 'SET_EDITING_TRAKT':
      return { ...state, editingTrakt: action.payload };
    case 'SET_TRAKT_INPUT':
      return { ...state, traktInput: action.payload };
    case 'SET_TRAKT_VALIDATING':
      return { ...state, traktValidating: action.payload };
    case 'SET_TRAKT_ERROR':
      return { ...state, traktError: action.payload };
    case 'SET_TRAKT_DELETING':
      return { ...state, traktDeleting: action.payload };
    case 'SET_TRAKT_CONNECTING':
      return { ...state, traktConnecting: action.payload };
    case 'RESET_LINK_FORM':
      return { ...state, linkForm: { username: "", password: "" }, linkError: null };
    default:
      return state;
  }
}

export function LinkedAccountsPanel({
  mode,
  userId
}: {
  mode: LinkedAccountsMode;
  userId?: string | number;
}) {
  const toast = useToast();
  const pathname = usePathname();
  const { confirm, modalProps } = useConfirm();
  const [state, dispatch] = useReducer(accountsReducer, initialState);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [oauthBusyProvider, setOauthBusyProvider] = useState<"google" | "github" | null>(null);
  const [pendingMfaAction, setPendingMfaAction] = useState<null | ((code: string) => Promise<void>)>(null);

  const adminUrl = userId ? `/api/v1/admin/users/${userId}` : null;
  const profileUrl = "/api/v1/profile";
  const swrKey = mode === "admin" ? adminUrl : profileUrl;

  const fetcher = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || "Failed to load linked accounts");
    return body;
  };

  const { data, error, mutate, isLoading } = useSWR<AdminUser | ProfileResponse>(swrKey, fetcher);
  const normalized = useMemo(() => {
    if (!data) return null;
    if (mode === "admin") {
      const admin = data as AdminUser;
      return {
        jellyfinUserId: admin.jellyfinUserId ?? null,
        jellyfinUsername: admin.jellyfinUsername ?? null,
        discordUserId: admin.discordUserId ?? null,
        letterboxdUsername: admin.letterboxdUsername ?? null,
        traktUsername: admin.traktUsername ?? null,
        googleLinked: admin.googleLinked ?? false,
        googleEmail: admin.googleEmail ?? null,
        githubLinked: admin.githubLinked ?? false,
        githubLogin: admin.githubLogin ?? null,
        traktLinked: false,
        traktTokenExpiresAt: null
      };
    }
    const profile = data as ProfileResponse;
    return {
      jellyfinUserId: profile.user?.jellyfinUserId ?? null,
      jellyfinUsername: profile.user?.jellyfinUsername ?? null,
      discordUserId: profile.user?.discordUserId ?? null,
      letterboxdUsername: profile.user?.letterboxdUsername ?? null,
      traktUsername: profile.user?.traktUsername ?? null,
      googleLinked: profile.user?.googleLinked ?? false,
      googleEmail: profile.user?.googleEmail ?? null,
      githubLinked: profile.user?.githubLinked ?? false,
      githubLogin: profile.user?.githubLogin ?? null,
      traktLinked: profile.user?.traktLinked ?? false,
      traktTokenExpiresAt: profile.user?.traktTokenExpiresAt ?? null
    };
  }, [data, mode]);

  const requestMfa = (action: (code: string) => Promise<void>) => {
    setMfaCode("");
    setMfaError(null);
    setPendingMfaAction(() => action);
    setMfaOpen(true);
  };

  const submitMfa = async () => {
    if (!pendingMfaAction) return;
    if (!mfaCode.trim()) {
      setMfaError("Enter your 6-digit MFA code");
      return;
    }
    setMfaBusy(true);
    setMfaError(null);
    try {
      await pendingMfaAction(mfaCode);
      setMfaOpen(false);
      setMfaCode("");
      setPendingMfaAction(null);
    } catch (err: any) {
      setMfaError(err?.message ?? "MFA verification failed");
    } finally {
      setMfaBusy(false);
    }
  };

  const handleUnlink = async () => {
    if (!normalized?.jellyfinUserId) return;
    const ok = await confirm("Are you sure you want to unlink this Jellyfin account?", { title: "Unlink Jellyfin", destructive: true, confirmLabel: "Unlink" });
    if (!ok) return;
    requestMfa(async (code) => {
      dispatch({ type: 'SET_UNLINKING', payload: true });
      try {
        const res = await csrfFetch(
          mode === "admin"
            ? `/api/v1/admin/users/${userId}/unlink-jellyfin`
            : "/api/v1/profile/jellyfin",
          {
            method: mode === "admin" ? "POST" : "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mfaCode: code })
          }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || "Failed to unlink account");
        }
        toast.success("Jellyfin account unlinked successfully");
        dispatch({ type: 'SET_SHOW_LINK_FORM', payload: false });
        mutate();
      } finally {
        dispatch({ type: 'SET_UNLINKING', payload: false });
      }
    });
  };

  const handleLink = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode !== "self") return;
    requestMfa(async (code) => {
      dispatch({ type: 'SET_LINK_ERROR', payload: null });
      dispatch({ type: 'SET_LINKING', payload: true });
      try {
        const res = await csrfFetch("/api/v1/profile/jellyfin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...state.linkForm, mfaCode: code })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || "Failed to link account");
        }
        toast.success("Jellyfin account linked");
        dispatch({ type: 'RESET_LINK_FORM' });
        dispatch({ type: 'SET_SHOW_LINK_FORM', payload: false });
        mutate();
      } catch (err: any) {
        dispatch({ type: 'SET_LINK_ERROR', payload: err?.message ?? "Failed to link account" });
        throw err;
      } finally {
        dispatch({ type: 'SET_LINKING', payload: false });
      }
    });
  };

  const handleSaveDiscord = async () => {
    dispatch({ type: 'SET_DISCORD_ERROR', payload: null });
    dispatch({ type: 'SET_DISCORD_VALIDATING', payload: true });
    try {
      // Validate Discord ID format first
      const res = await csrfFetch("/api/v1/profile/validate-discord", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordUserId: state.discordInput })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Invalid Discord ID");
      }

      // Save to profile
      const updateRes = await csrfFetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordUserId: state.discordInput.trim() })
      });
      const updateBody = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok) {
        throw new Error(updateBody?.error || "Failed to save Discord ID");
      }

      toast.success("Discord ID saved successfully");
      dispatch({ type: 'SET_EDITING_DISCORD', payload: false });
      mutate();
    } catch (err: any) {
      dispatch({ type: 'SET_DISCORD_ERROR', payload: err?.message ?? "Failed to save Discord ID" });
      toast.error(err?.message ?? "Failed to save Discord ID");
    } finally {
      dispatch({ type: 'SET_DISCORD_VALIDATING', payload: false });
    }
  };

  const handleSaveLetterboxd = async () => {
    dispatch({ type: 'SET_LETTERBOXD_ERROR', payload: null });
    dispatch({ type: 'SET_LETTERBOXD_VALIDATING', payload: true });
    try {
      // Validate Letterboxd username
      const res = await csrfFetch("/api/v1/profile/validate-letterboxd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterboxdUsername: state.letterboxdInput })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Invalid Letterboxd username");
      }

      // Save to profile
      const updateRes = await csrfFetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterboxdUsername: state.letterboxdInput.trim() })
      });
      const updateBody = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok) {
        throw new Error(updateBody?.error || "Failed to save Letterboxd username");
      }

      toast.success("Letterboxd username saved successfully");
      dispatch({ type: 'SET_EDITING_LETTERBOXD', payload: false });
      mutate();
    } catch (err: any) {
      dispatch({ type: 'SET_LETTERBOXD_ERROR', payload: err?.message ?? "Failed to save Letterboxd username" });
      toast.error(err?.message ?? "Failed to save Letterboxd username");
    } finally {
      dispatch({ type: 'SET_LETTERBOXD_VALIDATING', payload: false });
    }
  };

  const handleDeleteDiscord = async () => {
    const ok = await confirm("Are you sure you want to unlink your Discord account?", { title: "Unlink Discord", destructive: true, confirmLabel: "Unlink" });
    if (!ok) return;
    
    dispatch({ type: 'SET_DISCORD_DELETING', payload: true });
    try {
      const endpoint = mode === "admin" 
        ? `/api/v1/admin/users/${userId}`
        : "/api/v1/profile";
      
      const res = await csrfFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordUserId: null })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to unlink Discord");
      }

      toast.success("Discord account unlinked successfully");
      dispatch({ type: 'SET_EDITING_DISCORD', payload: false });
      mutate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to unlink Discord");
    } finally {
      dispatch({ type: 'SET_DISCORD_DELETING', payload: false });
    }
  };

  const handleDeleteLetterboxd = async () => {
    const ok = await confirm("Are you sure you want to unlink your Letterboxd account?", { title: "Unlink Letterboxd", destructive: true, confirmLabel: "Unlink" });
    if (!ok) return;
    
    dispatch({ type: 'SET_LETTERBOXD_DELETING', payload: true });
    try {
      const endpoint = mode === "admin" 
        ? `/api/v1/admin/users/${userId}`
        : "/api/v1/profile";
      
      const res = await csrfFetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterboxdUsername: null })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to unlink Letterboxd");
      }

      toast.success("Letterboxd account unlinked successfully");
      dispatch({ type: 'SET_EDITING_LETTERBOXD', payload: false });
      mutate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to unlink Letterboxd");
    } finally {
      dispatch({ type: 'SET_LETTERBOXD_DELETING', payload: false });
    }
  };

  const handleSaveTrakt = async () => {
    dispatch({ type: 'SET_TRAKT_ERROR', payload: null });
    dispatch({ type: 'SET_TRAKT_VALIDATING', payload: true });
    try {
      // Validate Trakt username
      const res = await csrfFetch("/api/v1/profile/validate-trakt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traktUsername: state.traktInput })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Invalid Trakt username");
      }

      // Save to profile
      const updateRes = await csrfFetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ traktUsername: state.traktInput.trim() })
      });
      const updateBody = await updateRes.json().catch(() => ({}));
      if (!updateRes.ok) {
        throw new Error(updateBody?.error || "Failed to save Trakt username");
      }

      toast.success("Trakt username saved successfully");
      dispatch({ type: 'SET_EDITING_TRAKT', payload: false });
      mutate();
    } catch (err: any) {
      dispatch({ type: 'SET_TRAKT_ERROR', payload: err?.message ?? "Failed to save Trakt username" });
      toast.error(err?.message ?? "Failed to save Trakt username");
    } finally {
      dispatch({ type: 'SET_TRAKT_VALIDATING', payload: false });
    }
  };

  const handleConnectTrakt = () => {
    if (typeof window === "undefined") return;
    dispatch({ type: 'SET_TRAKT_CONNECTING', payload: true });
    const returnTo = window.location.pathname + window.location.search;
    window.location.assign(`/api/v1/profile/trakt/connect?returnTo=${encodeURIComponent(returnTo)}`);
  };

  const handleDeleteTrakt = async () => {
    const ok = await confirm("Are you sure you want to unlink your Trakt account?", { title: "Unlink Trakt", destructive: true, confirmLabel: "Unlink" });
    if (!ok) return;
    
    dispatch({ type: 'SET_TRAKT_DELETING', payload: true });
    try {
      let res: Response;
      if (mode === "self") {
        res = await csrfFetch("/api/v1/profile/trakt/disconnect", { method: "POST" });
      } else {
        const endpoint = `/api/v1/admin/users/${userId}`;
        res = await csrfFetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ traktUsername: null })
        });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body?.error || "Failed to unlink Trakt");
      }

      toast.success("Trakt account unlinked successfully");
      dispatch({ type: 'SET_EDITING_TRAKT', payload: false });
      mutate();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to unlink Trakt");
    } finally {
      dispatch({ type: 'SET_TRAKT_DELETING', payload: false });
    }
  };

  const handleConnectOAuth = (provider: "google" | "github") => {
    if (mode !== "self") return;
    requestMfa(async (code) => {
      setOauthBusyProvider(provider);
      try {
        const res = await csrfFetch(`/api/v1/profile/oauth/${provider}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mfaCode: code, returnTo: pathname || "/settings/profile/linked" })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.url) {
          throw new Error(body?.error || `Failed to start ${provider} linking`);
        }
        window.location.assign(String(body.url));
      } finally {
        setOauthBusyProvider(null);
      }
    });
  };

  const handleUnlinkOAuth = async (provider: "google" | "github") => {
    const label = provider === "google" ? "Google" : "GitHub";
    const ok = await confirm(`Are you sure you want to unlink your ${label} account?`, { title: `Unlink ${label}`, destructive: true, confirmLabel: "Unlink" });
    if (!ok) return;

    requestMfa(async (code) => {
      setOauthBusyProvider(provider);
      try {
        const endpoint = mode === "admin"
          ? `/api/v1/admin/users/${userId}/oauth/${provider}`
          : `/api/v1/profile/oauth/${provider}`;
        const res = await csrfFetch(endpoint, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mfaCode: code })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(body?.error || `Failed to unlink ${label}`);
        }
        toast.success(`${label} account unlinked`);
        mutate();
      } finally {
        setOauthBusyProvider(null);
      }
    });
  };

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        Failed to load linked accounts
      </div>
    );
  }

  if (isLoading || !normalized) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
      </div>
    );
  }

  const linked = Boolean(normalized.jellyfinUserId);
  const hasDiscord = Boolean(normalized.discordUserId);
  const hasLetterboxd = Boolean(normalized.letterboxdUsername);
  const hasTrakt = Boolean(normalized.traktUsername);
  const hasTraktOauth = Boolean(normalized.traktLinked);
  const hasGoogle = Boolean(normalized.googleLinked);
  const hasGithub = Boolean(normalized.githubLinked);

  return (
    <div className="space-y-6">
      <ConfirmModal {...modalProps} />
      <Modal
        open={mfaOpen}
        title="Re-authenticate with MFA"
        onClose={() => {
          if (mfaBusy) return;
          setMfaOpen(false);
          setMfaCode("");
          setMfaError(null);
          setPendingMfaAction(null);
        }}
        forceCenter
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-300">Enter your 6-digit authenticator code to continue.</p>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            value={mfaCode}
            onChange={(event) => {
              setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6));
              setMfaError(null);
            }}
            className="w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white outline-none focus:border-white/40"
            placeholder="123456"
          />
          {mfaError ? <p className="text-xs text-red-300">{mfaError}</p> : null}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setMfaOpen(false);
                setMfaCode("");
                setMfaError(null);
                setPendingMfaAction(null);
              }}
              className="btn"
              disabled={mfaBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitMfa}
              className="btn btn-primary"
              disabled={mfaBusy || mfaCode.length < 6}
            >
              {mfaBusy ? "Verifying..." : "Verify"}
            </button>
          </div>
        </div>
      </Modal>
      <div>
        <h3 className="text-lg font-semibold text-white mb-1">Linked Accounts</h3>
        <p className="text-sm text-gray-400">View and manage connected external accounts</p>
        <div className="mt-3 p-4 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-gray-300 leading-relaxed">
            <span className="font-semibold text-white">Why link your accounts?</span> Connect your Discord, Letterboxd, Trakt, and Jellyfin accounts to unlock the full LeMedia experience. Discord notifications keep you updated on new content and community activity. Letterboxd and Trakt integration lets you track your movie and show ratings with detailed stats and recommendations. Jellyfin connection enables seamless media library management and synchronized viewing across all your devices.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
        <p className="text-xs text-gray-400">
          Linking and unlinking requires MFA re-auth. OAuth sign-in only works after linking here.
        </p>
      </div>

      {/* Google OAuth */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/40 via-slate-900/60 to-slate-900/40 p-4 sm:p-6 backdrop-blur-md hover:border-blue-500/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex flex-shrink-0 items-center justify-center shadow-lg">
                <Image
                  src="/google.svg"
                  alt="Google"
                  width={32}
                  height={32}
                  className="h-6 w-6 sm:h-8 sm:w-8"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-base sm:text-lg font-bold text-white">Google</h4>
                <p className="text-xs sm:text-sm text-gray-300 truncate">
                  {hasGoogle ? (normalized.googleEmail ?? "Connected") : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasGoogle && (
                <div className="px-2 sm:px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30 whitespace-nowrap">
                  Connected
                </div>
              )}
              {hasGoogle ? (
                <button
                  type="button"
                  onClick={() => handleUnlinkOAuth("google")}
                  disabled={oauthBusyProvider === "google"}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {oauthBusyProvider === "google" ? "Working..." : "Unlink"}
                </button>
              ) : (
                mode === "self" && (
                  <button
                    type="button"
                    onClick={() => handleConnectOAuth("google")}
                    disabled={oauthBusyProvider === "google"}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-blue-600/80 text-white hover:bg-blue-600 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {oauthBusyProvider === "google" ? "Working..." : "Connect"}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GitHub OAuth */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-600/20 bg-gradient-to-br from-gray-900/40 via-slate-900/60 to-slate-900/40 p-4 sm:p-6 backdrop-blur-md hover:border-gray-600/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-600/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-gray-700 to-gray-800 flex flex-shrink-0 items-center justify-center shadow-lg">
                <Image
                  src="/github.svg"
                  alt="GitHub"
                  width={32}
                  height={32}
                  className="h-6 w-6 sm:h-8 sm:w-8"
                />
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-base sm:text-lg font-bold text-white">GitHub</h4>
                <p className="text-xs sm:text-sm text-gray-300 truncate">
                  {hasGithub ? (normalized.githubLogin ? `@${normalized.githubLogin}` : "Connected") : "Not connected"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {hasGithub && (
                <div className="px-2 sm:px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30 whitespace-nowrap">
                  Connected
                </div>
              )}
              {hasGithub ? (
                <button
                  type="button"
                  onClick={() => handleUnlinkOAuth("github")}
                  disabled={oauthBusyProvider === "github"}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {oauthBusyProvider === "github" ? "Working..." : "Unlink"}
                </button>
              ) : (
                mode === "self" && (
                  <button
                    type="button"
                    onClick={() => handleConnectOAuth("github")}
                    disabled={oauthBusyProvider === "github"}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-gray-700/80 text-white hover:bg-gray-700 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {oauthBusyProvider === "github" ? "Working..." : "Connect"}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Discord Account */}
      <div className="relative overflow-hidden rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-950/40 via-slate-900/60 to-slate-900/40 p-4 sm:p-6 backdrop-blur-md hover:border-indigo-500/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          {state.editingDiscord ? (
            <div className="space-y-4">
              <div className="flex items-start sm:items-center gap-3 mb-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex flex-shrink-0 items-center justify-center shadow-lg">
                  <Image
                    src="/images/discord.svg"
                    alt="Discord"
                    width={32}
                    height={32}
                    className="h-6 w-6 sm:h-8 sm:w-8"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base sm:text-lg font-bold text-white">Discord</h4>
                  <p className="text-xs text-indigo-300">Link your Discord profile for notifications & community features</p>
                </div>
              </div>
              {state.discordError && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 sm:px-4 py-3 text-xs sm:text-sm text-red-200">
                  {state.discordError}
                </div>
              )}
              <input
                type="text"
                value={state.discordInput}
                onChange={e => dispatch({ type: 'SET_DISCORD_INPUT', payload: e.target.value })}
                placeholder="Enter your Discord user ID (17-19 digits)"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full rounded-xl border border-indigo-500/30 bg-indigo-950/20 px-3 sm:px-4 py-2 sm:py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all text-sm"
              />
              <p className="text-xs text-gray-400">
                Find your Discord ID at <a href="https://support.discord.com/hc/en-us/articles/206346498" target="_blank" rel="noreferrer" className="text-indigo-400 hover:text-indigo-300 underline">Discord Help Center</a>
              </p>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    dispatch({ type: 'SET_EDITING_DISCORD', payload: false });
                    dispatch({ type: 'SET_DISCORD_ERROR', payload: null });
                    dispatch({ type: 'SET_DISCORD_INPUT', payload: "" });
                  }}
                  className="px-3 sm:px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition text-xs sm:text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDiscord}
                  disabled={state.discordValidating || !state.discordInput.trim()}
                  className="px-3 sm:px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {state.discordValidating ? "Verifying..." : "Verify & Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex flex-shrink-0 items-center justify-center shadow-lg">
                  <Image
                    src="/images/discord.svg"
                    alt="Discord"
                    width={32}
                    height={32}
                    className="h-6 w-6 sm:h-8 sm:w-8"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base sm:text-lg font-bold text-white">Discord</h4>
                  <p className="text-xs sm:text-sm text-gray-300 truncate">
                    {hasDiscord ? `ID: ${normalized.discordUserId}` : "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {hasDiscord && (
                  <div className="px-2 sm:px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30 whitespace-nowrap">
                    Connected
                  </div>
                )}
                {(mode === "self" || mode === "admin") && (
                  <div className="flex gap-1 sm:gap-2">
                    <button
                      onClick={() => {
                        dispatch({ type: 'SET_EDITING_DISCORD', payload: true });
                        dispatch({ type: 'SET_DISCORD_INPUT', payload: normalized.discordUserId ?? "" });
                      }}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-indigo-600/80 text-white hover:bg-indigo-600 transition text-xs sm:text-sm font-medium whitespace-nowrap"
                    >
                      {hasDiscord ? "Edit" : "Add"}
                    </button>
                    {hasDiscord && (
                      <button
                        onClick={handleDeleteDiscord}
                        disabled={state.discordDeleting}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {state.discordDeleting ? "Removing..." : "Unlink"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Letterboxd Account */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 via-slate-900/60 to-slate-900/40 p-4 sm:p-6 backdrop-blur-md hover:border-emerald-500/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          {state.editingLetterboxd ? (
            <div className="space-y-4">
              <div className="flex items-start sm:items-center gap-3 mb-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex flex-shrink-0 items-center justify-center shadow-lg">
                  <Image
                    src="/images/letterboxd.svg"
                    alt="Letterboxd"
                    width={32}
                    height={32}
                    className="h-6 w-6 sm:h-8 sm:w-8"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base sm:text-lg font-bold text-white">Letterboxd</h4>
                  <p className="text-xs text-emerald-300">Link your profile to sync movies & track viewing history</p>
                </div>
              </div>
              {state.letterboxdError && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 sm:px-4 py-3 text-xs sm:text-sm text-red-200">
                  {state.letterboxdError}
                </div>
              )}
              <input
                type="text"
                value={state.letterboxdInput}
                onChange={e => dispatch({ type: 'SET_LETTERBOXD_INPUT', payload: e.target.value })}
                placeholder="Enter your Letterboxd username"
                className="w-full rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3 sm:px-4 py-2 sm:py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm"
              />
              <p className="text-xs text-gray-400">
                Create an account at <a href="https://letterboxd.com" target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 underline">Letterboxd.com</a>
              </p>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    dispatch({ type: 'SET_EDITING_LETTERBOXD', payload: false });
                    dispatch({ type: 'SET_LETTERBOXD_ERROR', payload: null });
                    dispatch({ type: 'SET_LETTERBOXD_INPUT', payload: "" });
                  }}
                  className="px-3 sm:px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition text-xs sm:text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveLetterboxd}
                  disabled={state.letterboxdValidating || !state.letterboxdInput.trim()}
                  className="px-3 sm:px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {state.letterboxdValidating ? "Verifying..." : "Verify & Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex flex-shrink-0 items-center justify-center shadow-lg">
                  <Image
                    src="/images/letterboxd.svg"
                    alt="Letterboxd"
                    width={32}
                    height={32}
                    className="h-6 w-6 sm:h-8 sm:w-8"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base sm:text-lg font-bold text-white">Letterboxd</h4>
                  <p className="text-xs sm:text-sm text-gray-300 truncate">
                    {hasLetterboxd ? `@${normalized.letterboxdUsername}` : "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {hasLetterboxd && (
                  <div className="px-2 sm:px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30 whitespace-nowrap">
                    Connected
                  </div>
                )}
                {(mode === "self" || mode === "admin") && (
                  <div className="flex gap-1 sm:gap-2">
                    <button
                      onClick={() => {
                        dispatch({ type: 'SET_EDITING_LETTERBOXD', payload: true });
                        dispatch({ type: 'SET_LETTERBOXD_INPUT', payload: normalized.letterboxdUsername ?? "" });
                      }}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-emerald-600/80 text-white hover:bg-emerald-600 transition text-xs sm:text-sm font-medium whitespace-nowrap"
                    >
                      {hasLetterboxd ? "Edit" : "Add"}
                    </button>
                    {hasLetterboxd && (
                      <button
                        onClick={handleDeleteLetterboxd}
                        disabled={state.letterboxdDeleting}
                        className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {state.letterboxdDeleting ? "Removing..." : "Unlink"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Trakt Account */}
      <div className="relative overflow-hidden rounded-2xl border border-red-500/20 bg-gradient-to-br from-red-950/40 via-slate-900/60 to-slate-900/40 p-4 sm:p-6 backdrop-blur-md hover:border-red-500/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          {state.editingTrakt ? (
            <div className="space-y-4">
              <div className="flex items-start sm:items-center gap-3 mb-4">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex flex-shrink-0 items-center justify-center shadow-lg">
                  <Image
                    src="/images/trakt.svg"
                    alt="Trakt"
                    width={32}
                    height={32}
                    className="h-6 w-6 sm:h-8 sm:w-8"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base sm:text-lg font-bold text-white">Trakt</h4>
                  <p className="text-xs text-red-300">Link your profile to track shows & movies</p>
                </div>
              </div>
              {state.traktError && (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 sm:px-4 py-3 text-xs sm:text-sm text-red-200">
                  {state.traktError}
                </div>
              )}
              <input
                type="text"
                value={state.traktInput}
                onChange={e => dispatch({ type: 'SET_TRAKT_INPUT', payload: e.target.value })}
                placeholder="Enter your Trakt username"
                className="w-full rounded-xl border border-red-500/30 bg-red-950/20 px-3 sm:px-4 py-2 sm:py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all text-sm"
              />
              <p className="text-xs text-gray-400">
                Visit <a href="https://trakt.tv" target="_blank" rel="noreferrer" className="text-red-400 hover:text-red-300 underline">Trakt.tv</a> to create an account
              </p>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    dispatch({ type: 'SET_EDITING_TRAKT', payload: false });
                    dispatch({ type: 'SET_TRAKT_ERROR', payload: null });
                    dispatch({ type: 'SET_TRAKT_INPUT', payload: "" });
                  }}
                  className="px-3 sm:px-4 py-2 rounded-lg border border-white/20 text-white hover:bg-white/10 transition text-xs sm:text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTrakt}
                  disabled={state.traktValidating || !state.traktInput.trim()}
                  className="px-3 sm:px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {state.traktValidating ? "Verifying..." : "Verify & Save"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div className="flex items-start sm:items-center gap-3 sm:gap-4 min-w-0">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex flex-shrink-0 items-center justify-center shadow-lg">
                  <Image
                    src="/images/trakt.svg"
                    alt="Trakt"
                    width={32}
                    height={32}
                    className="h-6 w-6 sm:h-8 sm:w-8"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base sm:text-lg font-bold text-white">Trakt</h4>
                  <p className="text-xs sm:text-sm text-gray-300 truncate">
                    {normalized?.traktUsername ? `@${normalized.traktUsername}` : "Not connected"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(hasTrakt || hasTraktOauth) && (
                  <div className="px-2 sm:px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30 whitespace-nowrap">
                    {hasTraktOauth ? "Connected" : "Username only"}
                  </div>
                )}
                {(mode === "self" || mode === "admin") && (
                  <div className="flex gap-1 sm:gap-2">
                    {mode === "self" ? (
                      <>
                        <button
                          onClick={handleConnectTrakt}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          disabled={state.traktConnecting}
                        >
                          {state.traktConnecting ? "Redirecting..." : (hasTraktOauth ? "Reconnect" : "Connect")}
                        </button>
                        {(hasTrakt || hasTraktOauth) && (
                          <button
                            onClick={handleDeleteTrakt}
                            disabled={state.traktDeleting}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {state.traktDeleting ? "Removing..." : "Unlink"}
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            dispatch({ type: 'SET_EDITING_TRAKT', payload: true });
                            dispatch({ type: 'SET_TRAKT_INPUT', payload: normalized?.traktUsername ?? "" });
                          }}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-xs sm:text-sm font-medium whitespace-nowrap"
                        >
                          {normalized?.traktUsername ? "Edit" : "Add"}
                        </button>
                        {normalized?.traktUsername && (
                          <button
                            onClick={handleDeleteTrakt}
                            disabled={state.traktDeleting}
                            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {state.traktDeleting ? "Removing..." : "Unlink"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Jellyfin Account */}
      <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 via-slate-900/60 to-slate-900/40 p-4 sm:p-6 backdrop-blur-md hover:border-purple-500/40 transition-all">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-transparent pointer-events-none"></div>
        <div className="relative">
          {linked ? (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex flex-shrink-0 items-center justify-center shadow-lg">
                  <Image
                    src="/images/jellyfin.svg"
                    alt="Jellyfin"
                    width={32}
                    height={32}
                    className="h-6 w-6 sm:h-8 sm:w-8"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-base sm:text-lg font-bold text-white">Jellyfin</h4>
                  <p className="text-xs sm:text-sm text-gray-300 truncate">{normalized.jellyfinUsername || "Connected"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="px-2 sm:px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-semibold border border-green-500/30 whitespace-nowrap">
                  Connected
                </div>
                <button
                  onClick={handleUnlink}
                  disabled={state.unlinking}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-red-600/80 text-white hover:bg-red-600 transition text-xs sm:text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {state.unlinking ? "Unlinking..." : "Unlink"}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 sm:py-8">
              <p className="text-gray-300 font-medium mb-2 text-sm sm:text-base">Jellyfin not connected</p>
              <p className="text-xs sm:text-sm text-gray-400 mb-4">
                {mode === "self"
                  ? "Connect your Jellyfin account to enable synchronized watchlists and recommendations"
                  : "This user has not connected a Jellyfin account"}
              </p>
              {mode === "self" ? (
                <button
                  onClick={() => dispatch({ type: 'SET_SHOW_LINK_FORM', payload: !state.showLinkForm })}
                  className="inline-flex items-center rounded-lg bg-purple-600/80 text-white px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium hover:bg-purple-600 transition whitespace-nowrap"
                >
                  {state.showLinkForm ? "Cancel" : "Connect Jellyfin"}
                </button>
              ) : null}
            </div>
          )}

          {mode === "self" && !linked && state.showLinkForm ? (
            <form className="mt-6 space-y-4" onSubmit={handleLink}>
              {state.linkError ? (
                <div className="rounded-lg border border-red-400/40 bg-red-500/10 px-3 sm:px-4 py-3 text-xs sm:text-sm text-red-200">
                  {state.linkError}
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-semibold text-white" htmlFor="jellyfin-username">
                    Jellyfin username
                  </label>
                  <input
                    id="jellyfin-username"
                    value={state.linkForm.username}
                    onChange={event => dispatch({ type: 'UPDATE_LINK_FORM_FIELD', field: 'username', value: event.target.value })}
                    className="w-full rounded-xl border border-purple-500/30 bg-purple-950/20 px-3 sm:px-4 py-2 sm:py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-sm"
                    placeholder="Jellyfin username"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs sm:text-sm font-semibold text-white" htmlFor="jellyfin-password">
                    Jellyfin password
                  </label>
                  <input
                    id="jellyfin-password"
                    type="password"
                    value={state.linkForm.password}
                    onChange={event => dispatch({ type: 'UPDATE_LINK_FORM_FIELD', field: 'password', value: event.target.value })}
                    className="w-full rounded-xl border border-purple-500/30 bg-purple-950/20 px-3 sm:px-4 py-2 sm:py-3 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all text-sm"
                    placeholder="Password"
                  />
                </div>
              </div>
              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'SET_SHOW_LINK_FORM', payload: false })}
                  className="px-4 sm:px-6 py-2 sm:py-3 rounded-xl border border-white/20 text-white hover:bg-white/10 transition text-xs sm:text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={state.linking}
                  className="px-4 sm:px-6 py-2 sm:py-3 rounded-xl bg-purple-600 text-white hover:bg-purple-700 transition text-xs sm:text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {state.linking ? "Linking..." : "Link Jellyfin"}
                </button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
