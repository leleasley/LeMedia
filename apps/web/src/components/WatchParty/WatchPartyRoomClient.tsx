"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import Button from "@/components/Common/Button";
import { Modal } from "@/components/Common/Modal";
import { useToast } from "@/components/Providers/ToastProvider";
import { AdaptiveSelect } from "@/components/ui/adaptive-select";
import { csrfFetch } from "@/lib/csrf-client";
import { ArrowLeft, ChevronDown, ChevronUp, Palette, Pause, Play, RefreshCcw, Trash2, Users } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type PartyInfo = {
  id: string;
  partySlug: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  mediaTitle: string;
  partyName: string;
  hostUserId: number;
  hostUsername: string;
  maxViewers: number;
  messageRateLimitSeconds: number;
  chatModerationEnabled: boolean;
  blockedLanguageFilterEnabled: boolean;
  selectedSeasonNumber: number | null;
  selectedEpisodeNumber: number | null;
  selectedEpisodeTitle: string | null;
  selectedJellyfinItemId: string | null;
  isPaused: boolean;
  playbackPositionSeconds: number;
  playbackUpdatedAt: string | null;
  theme: string;
  status: "active" | "ended" | "cancelled";
  viewerCount: number;
  playUrl: string | null;
};

type Participant = {
  userId: number;
  username: string;
  displayName: string | null;
  avatarUrl?: string | null;
  role: "host" | "member";
  canInvite: boolean;
  canPause: boolean;
  canModerateChat: boolean;
  chatMuted: boolean;
  chatColor: string;
  lastSeenAt: string | null;
};

type Message = {
  id: number;
  userId: number;
  username: string;
  displayName: string | null;
  chatColor: string;
  message: string;
  createdAt: string;
};

type JoinRequest = {
  id: string;
  requesterUserId: number;
  requesterUsername: string;
  requesterDisplayName: string | null;
};

type PartyPayload = {
  party: PartyInfo;
  me: Participant;
  participants: Participant[];
  messages: Message[];
  joinRequests: JoinRequest[];
};

type SocialUser = {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type SocialSearchPayload = { users: SocialUser[] };

type EpisodeOption = {
  itemId: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
};

type EpisodePayload = {
  seasons: number[];
  episodes: EpisodeOption[];
  selected: {
    seasonNumber: number | null;
    episodeNumber: number | null;
    episodeTitle: string | null;
    jellyfinItemId: string | null;
  };
};

type InviteRolePreset = "viewer" | "co_host_lite" | "moderator";

// ─── Themes ──────────────────────────────────────────────────────────────────

export const WATCH_PARTY_THEMES = [
  {
    id: "void",
    label: "Void",
    bg: "#09090b",
    preview: "#09090b",
  },
  {
    id: "midnight",
    label: "Midnight",
    bg: "linear-gradient(135deg, #020617 0%, #0f172a 40%, #1e3a5f 65%, #020617 100%)",
    preview: "linear-gradient(135deg, #0f172a, #1e3a5f)",
  },
  {
    id: "ember",
    label: "Ember",
    bg: "linear-gradient(135deg, #09090b 0%, #1c0a07 40%, #3d1400 70%, #09090b 100%)",
    preview: "linear-gradient(135deg, #1c0a07, #3d1400)",
  },
  {
    id: "forest",
    label: "Forest",
    bg: "linear-gradient(135deg, #09090b 0%, #052e16 40%, #14532d 70%, #09090b 100%)",
    preview: "linear-gradient(135deg, #052e16, #14532d)",
  },
  {
    id: "aurora",
    label: "Aurora",
    bg: "linear-gradient(135deg, #1e1b4b 0%, #0f172a 40%, #134e4a 70%, #1e1b4b 100%)",
    preview: "linear-gradient(135deg, #1e1b4b, #134e4a)",
  },
  {
    id: "rose",
    label: "Rose",
    bg: "linear-gradient(135deg, #09090b 0%, #4c0519 40%, #2d1b2e 70%, #09090b 100%)",
    preview: "linear-gradient(135deg, #4c0519, #2d1b2e)",
  },
  {
    id: "gold",
    label: "Gold",
    bg: "linear-gradient(135deg, #09090b 0%, #431407 35%, #78350f 60%, #09090b 100%)",
    preview: "linear-gradient(135deg, #431407, #78350f)",
  },
  // ── Horror / atmospheric ──
  {
    id: "blood",
    label: "Blood",
    bg: "linear-gradient(135deg, #0a0000 0%, #3b0000 40%, #6b0000 65%, #0a0000 100%)",
    preview: "linear-gradient(135deg, #3b0000, #6b0000)",
  },
  {
    id: "crypt",
    label: "Crypt",
    bg: "linear-gradient(135deg, #050508 0%, #1a0a2e 35%, #0e0e1a 65%, #050508 100%)",
    preview: "linear-gradient(135deg, #1a0a2e, #0e0e1a)",
  },
  {
    id: "neon",
    label: "Neon",
    bg: "linear-gradient(135deg, #020014 0%, #0d001f 40%, #00103a 70%, #020014 100%)",
    preview: "linear-gradient(135deg, #0d001f, #00103a)",
  },
  {
    id: "wasteland",
    label: "Wasteland",
    bg: "linear-gradient(135deg, #0a0800 0%, #1e1600 40%, #2d2200 70%, #0a0800 100%)",
    preview: "linear-gradient(135deg, #1e1600, #2d2200)",
  },
  {
    id: "inferno",
    label: "Inferno",
    bg: "linear-gradient(135deg, #0a0300 0%, #2d0c00 30%, #5c1800 55%, #1a0500 100%)",
    preview: "linear-gradient(135deg, #2d0c00, #5c1800)",
  },
  {
    id: "phantasm",
    label: "Phantasm",
    bg: "linear-gradient(135deg, #050508 0%, #0e0b1e 30%, #1a1030 55%, #080614 100%)",
    preview: "linear-gradient(135deg, #0e0b1e, #1a1030)",
  },
] as const;

type ThemeId = (typeof WATCH_PARTY_THEMES)[number]["id"];

function getTheme(id: string) {
  return WATCH_PARTY_THEMES.find((t) => t.id === id) ?? WATCH_PARTY_THEMES[0];
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(
      (json as { error?: string }).error || "Failed to load watch party"
    ) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return json as PartyPayload;
};

const genericFetcher = async <T,>(url: string) => {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  if (!res.ok) throw new Error("Failed request");
  return (await res.json()) as T;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseTimecode(value: string): number | null {
  const t = value.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const mmss = t.match(/^(\d+):(\d{1,2})$/);
  if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
  const hhmmss = t.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (hhmmss) return parseInt(hhmmss[1], 10) * 3600 + parseInt(hhmmss[2], 10) * 60 + parseInt(hhmmss[3], 10);
  return null;
}

function formatEpisodeLine(party: PartyInfo) {
  if (
    party.mediaType !== "tv" ||
    !party.selectedSeasonNumber ||
    !party.selectedEpisodeNumber
  )
    return null;
  const base = `S${party.selectedSeasonNumber}E${party.selectedEpisodeNumber}`;
  return party.selectedEpisodeTitle ? `${base} \u00b7 ${party.selectedEpisodeTitle}` : base;
}

// ─── Section accordion ────────────────────────────────────────────────────────

function Section({
  title,
  defaultOpen = true,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.06]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-white hover:bg-white/[0.03] transition-colors"
      >
        <span className="flex items-center gap-2">
          {title}
          {badge !== undefined && badge > 0 ? (
            <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-black">
              {badge}
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>
      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </div>
  );
}

// ─── Permission denied panel ──────────────────────────────────────────────────

function PermissionDeniedPanel(props: {
  onJoinAttempt: () => Promise<void>;
  onRequestAccess: () => Promise<void>;
  pending: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-6 text-center">
      <div className="w-full max-w-sm space-y-5">
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-6 py-8">
          <p className="text-4xl">&#x26D4;</p>
          <h1 className="mt-3 text-xl font-bold text-white">Access Denied</h1>
          <p className="mt-2 text-sm text-gray-400">
            This watch party is invite-only. Ask the host for an invite or send a join request.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button buttonType="primary" onClick={props.onJoinAttempt} disabled={props.pending}>
            Join with Invite
          </Button>
          <Button buttonType="ghost" onClick={props.onRequestAccess} disabled={props.pending}>
            Request Access
          </Button>
        </div>
        <Link
          href="/"
          className="block text-sm text-gray-600 underline hover:text-gray-400 transition-colors"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WatchPartyRoomClient({ partyId }: { partyId: string }) {
  const router = useRouter();
  const toast = useToast();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // UI state
  const [chatMessage, setChatMessage] = useState("");
  const [chatCooldownUntil, setChatCooldownUntil] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [partyNameInput, setPartyNameInput] = useState("");
  const [selectedInviteUserId, setSelectedInviteUserId] = useState("");
  const [inviteRolePreset, setInviteRolePreset] = useState<InviteRolePreset>("viewer");
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  // Playback controls
  const [playbackPositionInput, setPlaybackPositionInput] = useState("");
  // Message state (accumulated from initial load + SSE/poll deltas)
  const [allMessages, setAllMessages] = useState<Message[]>([]);
  const lastMessageIdRef = useRef(0);
  // Iframe reload key + load timestamp for position estimation
  const [iframeKey, setIframeKey] = useState(0);
  const iframeLoadTimeRef = useRef<number | null>(null);
  // Playback sync tracking
  const prevPlaybackUpdatedAtRef = useRef<string | null>(null);
  // SSE connection ref + live indicator
  const esRef = useRef<EventSource | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  // Personal theme (localStorage, overrides party theme for this viewer only)
  const [personalTheme, setPersonalThemeState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("wp-personal-theme");
  });
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  function setPersonalTheme(id: string | null) {
    if (id === null) {
      localStorage.removeItem("wp-personal-theme");
    } else {
      localStorage.setItem("wp-personal-theme", id);
    }
    setPersonalThemeState(id);
  }

  // ─── Data fetching ──────────────────────────────────────────────────────

  const { data, error, isLoading, mutate } = useSWR<PartyPayload>(
    `/api/v1/watch-party/${partyId}`,
    async (url: string) => {
      const after = lastMessageIdRef.current;
      const fetchUrl = after > 0 ? `${url}?after=${after}` : url;
      const res = await fetch(fetchUrl, { credentials: "include", cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(
          (json as { error?: string }).error || "Failed to load watch party"
        ) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return json as PartyPayload;
    },
    { refreshInterval: 10000, revalidateOnFocus: true }
  );

  const party = data?.party;
  const me = data?.me;
  const canHostManage = me?.role === "host";
  const canInvite = Boolean(me && (me.role === "host" || me.canInvite));
  const canModerate = Boolean(me && (me.role === "host" || me.canModerateChat));
  const denied = (error as { status?: number } | undefined)?.status === 403;

  const { data: episodeData, mutate: mutateEpisodes, isLoading: episodesLoading } =
    useSWR<EpisodePayload>(
      party?.mediaType === "tv" ? `/api/v1/watch-party/${partyId}/episodes` : null,
      genericFetcher
    );

  const { data: inviteUsersData } = useSWR<SocialSearchPayload>(
    canInvite ? "/api/v1/social/users/search?limit=50" : null,
    genericFetcher
  );

  // ─── Derived values ─────────────────────────────────────────────────────

  const participantById = useMemo(() => {
    const map = new Map<number, Participant>();
    for (const p of data?.participants ?? []) map.set(p.userId, p);
    return map;
  }, [data?.participants]);

  const selectedSeason =
    party?.selectedSeasonNumber ?? episodeData?.selected.seasonNumber ?? null;
  const selectedEpisode =
    party?.selectedEpisodeNumber ?? episodeData?.selected.episodeNumber ?? null;

  const seasonOptions = useMemo(
    () =>
      (episodeData?.seasons ?? []).map((s) => ({
        value: String(s),
        label: `Season ${s}`,
      })),
    [episodeData?.seasons]
  );

  const episodesForSelectedSeason = useMemo(
    () =>
      selectedSeason
        ? (episodeData?.episodes ?? []).filter((e) => e.seasonNumber === selectedSeason)
        : [],
    [episodeData?.episodes, selectedSeason]
  );

  const episodeOptions = useMemo(
    () =>
      episodesForSelectedSeason.map((e) => ({
        value: `${e.seasonNumber}-${e.episodeNumber}`,
        label: `E${e.episodeNumber}: ${e.title}`,
      })),
    [episodesForSelectedSeason]
  );

  const inviteOptions = useMemo(
    () =>
      (inviteUsersData?.users ?? []).map((u) => ({
        value: String(u.id),
        label: u.displayName || u.username,
      })),
    [inviteUsersData?.users]
  );

  const messageCooldownSeconds = party?.messageRateLimitSeconds ?? 15;
  const cooldownRemaining = Math.max(0, chatCooldownUntil - nowMs);
  const cooldownRemainingSeconds = Math.ceil(cooldownRemaining / 1000);
  const canSendChat =
    !me?.chatMuted && pendingAction !== "chat" && cooldownRemainingSeconds <= 0;

  // ─── Effects ────────────────────────────────────────────────────────────

  // Auto-scroll when messages grow
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMessages.length]);

  useEffect(() => {
    if (party?.status && party.status !== "active") setReviewModalOpen(true);
  }, [party?.status]);

  useEffect(() => {
    if (chatCooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [chatCooldownUntil]);

  // Presence dot refresh every 5s
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);

  // Merge poll message deltas into allMessages
  useEffect(() => {
    const incoming = data?.messages;
    if (!incoming || incoming.length === 0) return;
    const maxId = Math.max(...incoming.map((m) => m.id));
    setAllMessages((prev) => {
      const ids = new Set(prev.map((m) => m.id));
      const newOnes = incoming.filter((m) => !ids.has(m.id));
      if (newOnes.length === 0) return prev;
      const merged = [...prev, ...newOnes];
      merged.sort((a, b) => a.id - b.id);
      return merged;
    });
    if (maxId > lastMessageIdRef.current) lastMessageIdRef.current = maxId;
  }, [data?.messages]);

  // SSE connection for real-time chat delivery
  useEffect(() => {
    if (!partyId || typeof EventSource === "undefined") return;
    const es = new EventSource(`/api/v1/watch-party/${partyId}/stream`);
    esRef.current = es;

    es.onopen = () => setSseConnected(true);
    es.onerror = () => setSseConnected(false);

    es.addEventListener("connected", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { lastMessageId?: number };
      if (d.lastMessageId && d.lastMessageId > lastMessageIdRef.current) {
        lastMessageIdRef.current = d.lastMessageId;
      }
      setSseConnected(true);
    });

    es.addEventListener("messages", (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { messages: Message[] };
      if (!d.messages?.length) return;
      const maxId = Math.max(...d.messages.map((m) => m.id));
      setAllMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const newOnes = d.messages.filter((m) => !ids.has(m.id));
        if (newOnes.length === 0) return prev;
        return [...prev, ...newOnes];
      });
      if (maxId > lastMessageIdRef.current) lastMessageIdRef.current = maxId;
    });

    return () => {
      es.close();
      esRef.current = null;
      setSseConnected(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId]);

  // Reload iframe when host changes playback state
  useEffect(() => {
    if (!party) return;
    const updatedAt = party.playbackUpdatedAt ?? null;
    if (updatedAt && updatedAt !== prevPlaybackUpdatedAtRef.current) {
      prevPlaybackUpdatedAtRef.current = updatedAt;
      if (!party.isPaused) {
        setIframeKey((k) => k + 1);
      }
    }
  }, [party?.playbackUpdatedAt, party?.isPaused]);

  // ─── Action handlers ─────────────────────────────────────────────────────

  async function sendChat() {
    const trimmed = chatMessage.trim();
    if (!trimmed || !canSendChat) return;
    setPendingAction("chat");
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        message?: Message;
        error?: string;
        retryAfterSeconds?: number;
        warnCount?: number;
      };
      if (!res.ok) {
        if (res.status === 429 && payload.retryAfterSeconds) {
          setChatCooldownUntil(Date.now() + payload.retryAfterSeconds * 1000);
        }
        toast.error(payload.error || "Failed to send message");
        return;
      }
      // Optimistic: add message immediately so sender sees it instantly
      if (payload.message) {
        setAllMessages((prev) => {
          const ids = new Set(prev.map((m) => m.id));
          if (ids.has(payload.message!.id)) return prev;
          return [...prev, payload.message!];
        });
        lastMessageIdRef.current = Math.max(lastMessageIdRef.current, payload.message.id);
      }
      setChatMessage("");
      setChatCooldownUntil(Date.now() + messageCooldownSeconds * 1000);
    } catch {
      toast.error("Failed to send message");
    } finally {
      setPendingAction(null);
    }
  }

  async function endParty() {
    setEndConfirmOpen(false);
    setPendingAction("end");
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "end" }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to end party");
        return;
      }
      await mutate();
    } catch {
      toast.error("Unable to end party");
    } finally {
      setPendingAction(null);
    }
  }

  async function leaveParty() {
    setPendingAction("leave");
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave" }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to leave party");
        return;
      }
      toast.success("You left the watch party.");
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Unable to leave party");
    } finally {
      setPendingAction(null);
    }
  }

  async function inviteUser() {
    if (!selectedInviteUserId) {
      toast.error("Select a user to invite");
      return;
    }
    setPendingAction("invite");
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}/invite`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: Number(selectedInviteUserId), rolePreset: inviteRolePreset }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to send invite");
        return;
      }
      setSelectedInviteUserId("");
      setInviteRolePreset("viewer");
      toast.success("Invite sent");
    } catch {
      toast.error("Unable to send invite");
    } finally {
      setPendingAction(null);
    }
  }

  async function resolveJoinRequest(requestId: string, decision: "approved" | "denied") {
    setPendingAction(`jr-${requestId}`);
    try {
      const res = await csrfFetch(
        `/api/v1/watch-party/${partyId}/join-request/${requestId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        }
      );
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to resolve join request");
        return;
      }
      await mutate();
    } catch {
      toast.error("Unable to resolve join request");
    } finally {
      setPendingAction(null);
    }
  }

  async function updatePermissions(userId: number, updates: Partial<Participant>) {
    setPendingAction(`p-${userId}`);
    try {
      const res = await csrfFetch(
        `/api/v1/watch-party/${partyId}/participants/${userId}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }
      );
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to update participant");
        return;
      }
      await mutate();
    } catch {
      toast.error("Unable to update participant");
    } finally {
      setPendingAction(null);
    }
  }

  async function renameParty() {
    const nextName = partyNameInput.trim();
    if (!nextName) return;
    setPendingAction("rename");
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partyName: nextName }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        toast.error(payload.message || payload.error || "Unable to rename party");
        return;
      }
      toast.success("Party name updated");
      await mutate();
    } catch {
      toast.error("Unable to rename party");
    } finally {
      setPendingAction(null);
    }
  }

  async function updatePartySettings(updates: {
    chatModerationEnabled?: boolean;
    blockedLanguageFilterEnabled?: boolean;
    messageRateLimitSeconds?: number;
    selectedSeasonNumber?: number | null;
    selectedEpisodeNumber?: number | null;
    selectedEpisodeTitle?: string | null;
    selectedJellyfinItemId?: string | null;
    theme?: ThemeId;
  }) {
    setPendingAction("settings");
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to update settings");
        return;
      }
      await mutate();
    } catch {
      toast.error("Unable to update settings");
    } finally {
      setPendingAction(null);
    }
  }

  async function onSeasonChange(value: string) {
    const seasonNumber = Number(value);
    if (!Number.isFinite(seasonNumber)) return;
    const firstEpisode = (episodeData?.episodes ?? []).find(
      (e) => e.seasonNumber === seasonNumber
    );
    await updatePartySettings({
      selectedSeasonNumber: seasonNumber,
      selectedEpisodeNumber: firstEpisode?.episodeNumber ?? null,
      selectedEpisodeTitle: firstEpisode?.title ?? null,
      selectedJellyfinItemId: firstEpisode?.itemId ?? null,
    });
  }

  async function onEpisodeChange(value: string) {
    const [seasonRaw, episodeRaw] = value.split("-");
    const seasonNumber = Number(seasonRaw);
    const episodeNumber = Number(episodeRaw);
    if (!Number.isFinite(seasonNumber) || !Number.isFinite(episodeNumber)) return;
    const selected = (episodeData?.episodes ?? []).find(
      (e) => e.seasonNumber === seasonNumber && e.episodeNumber === episodeNumber
    );
    if (!selected) return;
    await updatePartySettings({
      selectedSeasonNumber: selected.seasonNumber,
      selectedEpisodeNumber: selected.episodeNumber,
      selectedEpisodeTitle: selected.title,
      selectedJellyfinItemId: selected.itemId,
    });
  }

  async function submitReview() {
    if (!party) return;
    setPendingAction("review");
    try {
      const res = await csrfFetch("/api/v1/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaType: party.mediaType,
          tmdbId: party.tmdbId,
          rating: reviewRating,
          reviewText: reviewText.trim() || null,
          spoiler: false,
          title: party.mediaTitle,
          posterPath: null,
          releaseYear: null,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to save review");
        return;
      }
      toast.success("Review saved!");
      setReviewText("");
      setReviewModalOpen(false);
      router.push("/");
    } catch {
      toast.error("Unable to save review");
    } finally {
      setPendingAction(null);
    }
  }

  async function tryJoinWithInvite() {
    setPendingAction("join");
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}/join`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to join watch party");
        return;
      }
      await mutate();
    } catch {
      toast.error("Unable to join watch party");
    } finally {
      setPendingAction(null);
    }
  }

  async function requestAccess() {
    setPendingAction("request-access");
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}/join-request`, {
        method: "POST",
        credentials: "include",
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to send join request");
        return;
      }
      toast.success("Join request sent");
    } catch {
      toast.error("Unable to send join request");
    } finally {
      setPendingAction(null);
    }
  }

  async function deleteMessage(messageId: number) {
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}/chat/${messageId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(payload.error || "Unable to delete message");
        return;
      }
      setAllMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      toast.error("Unable to delete message");
    }
  }

  async function updatePlayback(opts: { isPaused?: boolean; playbackPositionSeconds?: number }) {
    setPendingAction("playback");
    try {
      const res = await csrfFetch(`/api/v1/watch-party/${partyId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error || "Unable to update playback");
        return;
      }
      await mutate();
    } catch {
      toast.error("Unable to update playback");
    } finally {
      setPendingAction(null);
    }
  }

  // ─── Render states ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="space-y-3 text-center">
          <p className="text-2xl">&#x1F3AC;</p>
          <p className="text-sm text-gray-400">Loading watch party...</p>
        </div>
      </div>
    );
  }

  if (denied) {
    return (
      <PermissionDeniedPanel
        onJoinAttempt={tryJoinWithInvite}
        onRequestAccess={requestAccess}
        pending={Boolean(pendingAction)}
      />
    );
  }

  if (!data || !party || !me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-950">
        <p className="text-red-300">Watch party unavailable or expired.</p>
        <Link href="/" className="text-sm text-gray-500 underline hover:text-gray-300">
          Back to Home
        </Link>
      </div>
    );
  }

  const episodeLine = formatEpisodeLine(party);
  const isActive = party.status === "active";
  const canStartPlayback = party.viewerCount >= 2;
  const canControlPlayback = Boolean(me && (me.role === "host" || me.canPause));
  const joinRequestCount = data.joinRequests?.length ?? 0;

  // Build iframe URL with start position if playback state has a position
  const iframePlayUrl = (() => {
    if (!party.playUrl) return null;
    if (!party.playbackPositionSeconds || party.playbackPositionSeconds <= 10) return party.playUrl;
    const ticks = party.playbackPositionSeconds * 10_000_000;
    return `${party.playUrl}&startPositionTicks=${ticks}`;
  })();

  // ─── Main render ──────────────────────────────────────────────────────────

  return (
    <div
      className="flex h-screen flex-col overflow-hidden text-white"
      style={{ background: getTheme(personalTheme ?? party.theme).bg }}
    >

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <header className="flex h-14 flex-none shrink-0 items-center gap-3 border-b border-white/10 bg-black/70 px-4 backdrop-blur">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-1.5 text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden text-sm sm:inline">Home</span>
        </Link>

        <div className="h-5 w-px shrink-0 bg-white/10" />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold leading-tight text-white">
            {party.partyName}
          </h1>
          <p className="truncate text-xs leading-tight text-gray-400">
            {party.mediaTitle}
            {episodeLine ? ` \u00b7 ${episodeLine}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1 text-xs text-gray-400 sm:flex">
            <Users className="h-3.5 w-3.5" />
            {party.viewerCount}/{party.maxViewers}
          </span>

          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
              isActive
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-300"
                : "border-white/10 bg-zinc-800/50 text-zinc-400"
            }`}
          >
            {isActive ? "\u25cf Live" : "Ended"}
          </span>

          {canHostManage ? (
            <Button
              buttonType="danger"
              buttonSize="sm"
              onClick={() => setEndConfirmOpen(true)}
              disabled={!isActive || pendingAction === "end"}
            >
              End Party
            </Button>
          ) : (
            <Button
              buttonType="ghost"
              buttonSize="sm"
              onClick={leaveParty}
              disabled={pendingAction === "leave"}
            >
              Leave
            </Button>
          )}

          {/* Personal theme picker — available to all viewers */}
          <div className="relative">
            <button
              type="button"
              title="My Theme"
              onClick={() => setThemePickerOpen((v) => !v)}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 bg-black/30 text-gray-400 transition-colors hover:border-white/30 hover:text-white"
            >
              <Palette className="h-4 w-4" />
            </button>

            {themePickerOpen ? (
              <>
                {/* Backdrop to close on outside click */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setThemePickerOpen(false)}
                />
                <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-white/10 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur">
                  <p className="mb-2.5 text-xs font-semibold text-gray-400">My Theme</p>
                  <div className="grid grid-cols-4 gap-2">
                    {/* "Party" option — revert to host's choice */}
                    <button
                      type="button"
                      title="Party default"
                      onClick={() => { setPersonalTheme(null); setThemePickerOpen(false); }}
                      className={`group flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-all ${
                        personalTheme === null
                          ? "border-white/40 bg-white/10"
                          : "border-white/10 hover:border-white/25 hover:bg-white/5"
                      }`}
                    >
                      <span
                        className="h-7 w-full rounded"
                        style={{ background: getTheme(party.theme).preview }}
                      />
                      <span className="text-[10px] leading-none text-gray-400 group-hover:text-white">
                        Party
                      </span>
                    </button>

                    {WATCH_PARTY_THEMES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        title={t.label}
                        onClick={() => { setPersonalTheme(t.id); setThemePickerOpen(false); }}
                        className={`group flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-all ${
                          personalTheme === t.id
                            ? "border-white/40 bg-white/10"
                            : "border-white/10 hover:border-white/25 hover:bg-white/5"
                        }`}
                      >
                        <span
                          className="h-7 w-full rounded"
                          style={{ background: t.preview }}
                        />
                        <span className="text-[10px] leading-none text-gray-400 group-hover:text-white">
                          {t.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left column: player + host controls */}
        <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">

          {/* Player */}
          <div className="relative w-full bg-black">
            {canStartPlayback && iframePlayUrl ? (
              <>
                <iframe
                  key={iframeKey}
                  src={iframePlayUrl}
                  className="aspect-video w-full"
                  allow="autoplay; fullscreen; picture-in-picture"
                  referrerPolicy="no-referrer"
                  title="Watch party player"
                  onLoad={() => { iframeLoadTimeRef.current = Date.now(); }}
                />
                {party.isPaused ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/80 pointer-events-none">
                    <div className="text-center">
                      <Pause className="mx-auto h-12 w-12 text-white/80" strokeWidth={1.5} />
                      <p className="mt-2 text-sm font-bold tracking-widest text-white uppercase">Paused</p>
                      <p className="mt-1 text-xs text-gray-400">
                        {canControlPlayback ? "Use Playback Controls to resume" : "Paused by the host"}
                      </p>
                    </div>
                  </div>
                ) : null}
              </>
            ) : !canStartPlayback ? (
              <div className="flex aspect-video w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-zinc-900 via-black to-zinc-950 px-6 text-center">
                <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-200">
                  Waiting Room
                </span>
                <p className="text-lg font-semibold text-white">
                  Waiting for more people to join
                </p>
                <p className="text-sm text-gray-400">
                  Playback starts when 2+ viewers are in the room &middot;{" "}
                  {party.viewerCount}/{party.maxViewers} joined
                </p>
              </div>
            ) : (
              <div className="flex aspect-video w-full items-center justify-center text-sm text-gray-500">
                Playback URL unavailable
              </div>
            )}
          </div>

          {/* Host + canPause controls */}
          {(canHostManage || canControlPlayback) ? (
            <div className="divide-y divide-white/[0.06] border-t border-white/10 bg-zinc-900/20">

              {/* Playback Controls */}
              {canControlPlayback && isActive ? (
                <Section title="Global Playback">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>
                        {party.isPaused ? "⏸ Paused" : "▶ Playing"}
                      </span>
                      {party.playbackPositionSeconds > 0 ? (
                        <span className="text-gray-500">· ~{formatDuration(party.playbackPositionSeconds)}</span>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        buttonType={party.isPaused ? "primary" : "ghost"}
                        buttonSize="sm"
                        onClick={() =>
                          updatePlayback({
                            isPaused: !party.isPaused,
                            playbackPositionSeconds: party.isPaused
                              ? party.playbackPositionSeconds
                              : party.playbackPositionSeconds +
                                (iframeLoadTimeRef.current
                                  ? Math.floor((Date.now() - iframeLoadTimeRef.current) / 1000)
                                  : 0),
                          })
                        }
                        disabled={pendingAction === "playback"}
                      >
                        {party.isPaused ? (
                          <><Play className="h-3 w-3 mr-1 inline" />Resume Everyone</>
                        ) : (
                          <><Pause className="h-3 w-3 mr-1 inline" />Pause Everyone</>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      This control applies to everyone currently in the party.
                    </p>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-gray-400">
                        Seek all to time
                      </label>
                      <div className="flex gap-2">
                        <input
                          value={playbackPositionInput}
                          onChange={(e) => setPlaybackPositionInput(e.target.value)}
                          placeholder="e.g. 45:30 or 2732s"
                          className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/30"
                        />
                        <Button
                          buttonType="default"
                          buttonSize="sm"
                          onClick={() => {
                            const seconds = parseTimecode(playbackPositionInput);
                            if (seconds === null) {
                              toast.error("Enter a time like 45:30, 1:23:45, or seconds like 2732");
                              return;
                            }
                            updatePlayback({ isPaused: false, playbackPositionSeconds: seconds });
                            setPlaybackPositionInput("");
                          }}
                          disabled={pendingAction === "playback" || !playbackPositionInput.trim()}
                        >
                          Seek
                        </Button>
                      </div>
                    </div>
                  </div>
                </Section>
              ) : null}

              {/* Episode selection — TV only — host-only */}
              {canHostManage && party.mediaType === "tv" ? (
                <Section title="Episode Selection">
                  <div className="space-y-3">
                    {episodesLoading ? (
                      <p className="text-xs text-gray-400">Loading seasons from Jellyfin&hellip;</p>
                    ) : seasonOptions.length === 0 ? (
                      <div className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-3 text-xs text-amber-200">
                        No seasons found in Jellyfin for this show. Make sure it is in
                        your library, then click Refresh.
                        <button
                          type="button"
                          onClick={() => void mutateEpisodes()}
                          className="ml-2 inline-flex items-center gap-1 rounded border border-amber-300/30 px-2 py-0.5 hover:bg-amber-500/10"
                        >
                          <RefreshCcw className="h-3 w-3" />
                          Refresh
                        </button>
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-gray-400">
                            Season
                          </label>
                          <AdaptiveSelect
                            value={selectedSeason ? String(selectedSeason) : undefined}
                            onValueChange={onSeasonChange}
                            options={seasonOptions}
                            placeholder="Select season"
                            disabled={pendingAction === "settings"}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-gray-400">
                            Episode
                          </label>
                          <AdaptiveSelect
                            value={
                              selectedSeason && selectedEpisode
                                ? `${selectedSeason}-${selectedEpisode}`
                                : undefined
                            }
                            onValueChange={onEpisodeChange}
                            options={episodeOptions}
                            placeholder="Select episode"
                            disabled={pendingAction === "settings" || !selectedSeason}
                          />
                        </div>
                      </div>
                    )}
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void mutateEpisodes()}
                        className="inline-flex items-center gap-1.5 rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-gray-400 transition-colors hover:border-white/25 hover:text-white"
                      >
                        <RefreshCcw className="h-3 w-3" />
                        Refresh Seasons
                      </button>
                    </div>
                  </div>
                </Section>
              ) : null}

              {/* Party Settings */}
              <Section title="Party Settings" defaultOpen={false}>
                <div className="space-y-5">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Rename Party
                    </label>
                    <div className="flex gap-2">
                      <input
                        value={partyNameInput}
                        onChange={(e) => setPartyNameInput(e.target.value)}
                        placeholder={party.partyName}
                        maxLength={80}
                        className="flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-white/30 focus:outline-none"
                      />
                      <Button
                        buttonType="default"
                        onClick={renameParty}
                        disabled={pendingAction === "rename" || !partyNameInput.trim()}
                      >
                        Rename
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Chat Cooldown (per user)
                    </label>
                    <AdaptiveSelect
                      value={String(party.messageRateLimitSeconds)}
                      onValueChange={(v) =>
                        updatePartySettings({ messageRateLimitSeconds: Number(v) })
                      }
                      options={[1, 5, 10, 15, 20, 30, 45, 60].map((v) => ({
                        value: String(v),
                        label: `${v} seconds`,
                      }))}
                      placeholder="Cooldown"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <label className="flex items-center gap-2.5 text-sm text-white">
                      <input
                        type="checkbox"
                        checked={party.chatModerationEnabled}
                        onChange={(e) =>
                          updatePartySettings({
                            chatModerationEnabled: e.target.checked,
                            blockedLanguageFilterEnabled: e.target.checked
                              ? party.blockedLanguageFilterEnabled
                              : false,
                          })
                        }
                        disabled={pendingAction === "settings"}
                        className="rounded"
                      />
                      Enable chat moderation
                    </label>
                    <label className="flex items-center gap-2.5 text-sm text-gray-400">
                      <input
                        type="checkbox"
                        checked={party.blockedLanguageFilterEnabled}
                        onChange={(e) =>
                          updatePartySettings({
                            chatModerationEnabled: true,
                            blockedLanguageFilterEnabled: e.target.checked,
                          })
                        }
                        disabled={
                          !party.chatModerationEnabled || pendingAction === "settings"
                        }
                        className="rounded"
                      />
                      Block profanity and slurs
                    </label>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-medium text-gray-400">
                      Party Theme
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {WATCH_PARTY_THEMES.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          title={t.label}
                          onClick={() => void updatePartySettings({ theme: t.id as ThemeId })}
                          disabled={pendingAction === "settings"}
                          className={`group flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-all disabled:opacity-50 ${
                            party.theme === t.id
                              ? "border-white/40 bg-white/10"
                              : "border-white/10 hover:border-white/25 hover:bg-white/5"
                          }`}
                        >
                          <span
                            className="h-7 w-full rounded"
                            style={{ background: t.preview }}
                          />
                          <span className="text-[10px] leading-none text-gray-400 group-hover:text-white">
                            {t.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Section>

              {/* Invite Viewers */}
              {canInvite ? (
                <Section title="Invite Viewers" defaultOpen={false}>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <AdaptiveSelect
                          value={selectedInviteUserId || undefined}
                          onValueChange={setSelectedInviteUserId}
                          options={inviteOptions}
                          placeholder={
                            inviteOptions.length === 0
                              ? "No users available"
                              : "Select user to invite"
                          }
                          disabled={inviteOptions.length === 0}
                        />
                      </div>
                      <Button
                        buttonType="primary"
                        onClick={inviteUser}
                        disabled={pendingAction === "invite" || !selectedInviteUserId}
                      >
                        Invite
                      </Button>
                    </div>
                    <div className="max-w-xs">
                      <label className="mb-1.5 block text-xs font-medium text-gray-400">
                        Role preset
                      </label>
                      <AdaptiveSelect
                        value={inviteRolePreset}
                        onValueChange={(value) => setInviteRolePreset(value as InviteRolePreset)}
                        options={[
                          { value: "viewer", label: "Viewer" },
                          { value: "co_host_lite", label: "Co-host Lite (Pause/Resume)" },
                          { value: "moderator", label: "Moderator (Chat moderation)" },
                        ]}
                        placeholder="Select role preset"
                      />
                    </div>
                  </div>
                </Section>
              ) : null}

              {/* Join Requests */}
              {joinRequestCount > 0 ? (
                <Section title="Join Requests" badge={joinRequestCount}>
                  <div className="space-y-2">
                    {data.joinRequests.map((req) => (
                      <div
                        key={req.id}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <p className="text-sm text-gray-200">
                          {req.requesterDisplayName || req.requesterUsername}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            buttonType="success"
                            buttonSize="sm"
                            onClick={() => resolveJoinRequest(req.id, "approved")}
                            disabled={pendingAction === `jr-${req.id}`}
                          >
                            Approve
                          </Button>
                          <Button
                            buttonType="danger"
                            buttonSize="sm"
                            onClick={() => resolveJoinRequest(req.id, "denied")}
                            disabled={pendingAction === `jr-${req.id}`}
                          >
                            Deny
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </Section>
              ) : null}

              {/* Viewers / Participants */}
              <Section title={`Viewers (${data.participants.length})`} defaultOpen={false}>
                <div className="space-y-2">
                  {data.participants.map((p) => (
                    <div
                      key={p.userId}
                      className="rounded-lg border border-white/10 bg-black/20 p-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {/* Online presence dot */}
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              p.lastSeenAt && nowMs - new Date(p.lastSeenAt).getTime() < 20000
                                ? "bg-emerald-400"
                                : "bg-zinc-600"
                            }`}
                          />
                          {p.avatarUrl ? (
                            <img
                              src={p.avatarUrl}
                              alt=""
                              className="h-7 w-7 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs text-white">
                              {(p.displayName || p.username).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span
                            className="truncate text-sm"
                            style={{ color: p.chatColor }}
                          >
                            {p.displayName || p.username}
                            {p.role === "host" ? " \u00b7 Host" : ""}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs text-gray-500">
                          {p.chatMuted ? "Muted" : p.canModerateChat ? "Mod" : ""}
                        </span>
                      </div>

                      {canModerate && p.role !== "host" ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              updatePermissions(p.userId, {
                                chatMuted: !participantById.get(p.userId)?.chatMuted,
                              })
                            }
                            disabled={pendingAction === `p-${p.userId}`}
                            className="rounded border border-white/15 px-2 py-0.5 text-xs text-gray-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
                          >
                            {p.chatMuted ? "Unmute" : "Mute"}
                          </button>
                          {me.role === "host" ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  updatePermissions(p.userId, {
                                    canInvite: !participantById.get(p.userId)?.canInvite,
                                  })
                                }
                                disabled={pendingAction === `p-${p.userId}`}
                                className="rounded border border-white/15 px-2 py-0.5 text-xs text-gray-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
                              >
                                {p.canInvite ? "Revoke Invite" : "Allow Invite"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  updatePermissions(p.userId, {
                                    canPause: !participantById.get(p.userId)?.canPause,
                                  })
                                }
                                disabled={pendingAction === `p-${p.userId}`}
                                className="rounded border border-white/15 px-2 py-0.5 text-xs text-gray-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
                              >
                                  {p.canPause ? "Revoke Playback Ctrl" : "Allow Playback Ctrl"}
                              </button>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          ) : null}
        </div>

        {/* Right column: Chat sidebar */}
        <aside className="flex w-64 shrink-0 flex-col border-l border-white/10 bg-zinc-900/30 lg:w-72">
          {/* Chat header */}
          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              Chat
              <span
                title={sseConnected ? "Live" : "Polling"}
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  sseConnected
                    ? "animate-pulse bg-emerald-400"
                    : "bg-zinc-600"
                }`}
              />
            </h2>
            <span className="text-xs tabular-nums">
              {cooldownRemainingSeconds > 0 ? (
                <span className="text-amber-400">{cooldownRemainingSeconds}s</span>
              ) : (
                <span className="text-gray-500">1/{messageCooldownSeconds}s</span>
              )}
            </span>
          </div>

          {/* Messages */}
          <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
            {allMessages.length === 0 ? (
              <p className="mt-4 text-center text-xs text-gray-600">
                No messages yet. Say hello!
              </p>
            ) : (
              allMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="rounded-lg border px-3 py-2 group"
                  style={{
                    borderColor: `${msg.chatColor}30`,
                    backgroundColor: "rgba(0,0,0,0.3)",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <p className="text-xs font-medium min-w-0 truncate" style={{ color: msg.chatColor }}>
                      {msg.displayName || msg.username}
                      <span className="ml-1.5 font-normal text-gray-500">
                        {formatTime(msg.createdAt)}
                      </span>
                    </p>
                    {canModerate ? (
                      <button
                        type="button"
                        onClick={() => void deleteMessage(msg.id)}
                        className="shrink-0 text-gray-700 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                        aria-label="Delete message"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm leading-snug text-gray-100">
                    {msg.message}
                  </p>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat input */}
          <div className="shrink-0 space-y-2.5 border-t border-white/[0.06] p-3">
            {party.chatModerationEnabled && party.blockedLanguageFilterEnabled ? (
              <p className="text-[11px] text-amber-300/70">Chat filter active</p>
            ) : null}

            <div className="flex gap-2">
              <input
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
                placeholder={me.chatMuted ? "You are muted" : "Message\u2026"}
                disabled={me.chatMuted}
                maxLength={2000}
                className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-white/30 focus:outline-none disabled:opacity-50"
              />
              <Button
                buttonType="primary"
                onClick={sendChat}
                disabled={!canSendChat || !chatMessage.trim()}
              >
                Send
              </Button>
            </div>

            {/* Chat colour picker */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-600">Colour</span>
              {["#60A5FA", "#EC4899", "#34D399", "#F59E0B", "#A78BFA", "#F43F5E"].map(
                (color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updatePermissions(me.userId, { chatColor: color })}
                    disabled={pendingAction === `p-${me.userId}`}
                    className="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50"
                    style={{
                      backgroundColor: color,
                      borderColor: me.chatColor === color ? "white" : "transparent",
                    }}
                    aria-label={color}
                  />
                )
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* ── End Party Confirmation ─────────────────────────────────────────────── */}
      <Modal
        open={endConfirmOpen}
        onClose={() => setEndConfirmOpen(false)}
        title="End Watch Party?"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            This will end the party for everyone. You can leave a review before going home.
          </p>
          <div className="flex justify-end gap-2">
            <Button buttonType="ghost" onClick={() => setEndConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              buttonType="danger"
              onClick={endParty}
              disabled={pendingAction === "end"}
            >
              End Party
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Review Modal ───────────────────────────────────────────────────────── */}
      <Modal
        open={party.status !== "active" && reviewModalOpen}
        onClose={() => {
          setReviewModalOpen(false);
          router.push("/");
        }}
        title={`Party ended \u00b7 ${party.mediaTitle}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">
            The watch party has ended. Leave a quick review for{" "}
            <span className="font-medium text-white">{party.mediaTitle}</span>?
          </p>

          <div>
            <p className="mb-2 text-xs font-medium text-gray-400">Rating</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  className={`h-9 w-9 rounded-lg border text-sm font-semibold transition-colors ${
                    reviewRating >= star
                      ? "border-amber-400 bg-amber-400/20 text-amber-300"
                      : "border-white/15 bg-black/20 text-gray-400 hover:border-white/30"
                  }`}
                >
                  {star}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-400">
              Optional review
            </label>
            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              className="h-20 w-full resize-none rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:border-white/30 focus:outline-none"
              placeholder="What did you think?"
              maxLength={4000}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              buttonType="ghost"
              onClick={() => {
                setReviewModalOpen(false);
                router.push("/");
              }}
            >
              Skip
            </Button>
            <Button
              buttonType="primary"
              onClick={submitReview}
              disabled={pendingAction === "review"}
            >
              Submit and Go Home
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
