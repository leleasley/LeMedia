"use client";

import { useState } from "react";
import useSWR from "swr";
import { useToast } from "@/components/Providers/ToastProvider";
import { csrfFetch } from "@/lib/csrf-client";

const fetcher = (url: string) =>
  fetch(url, { credentials: "include", cache: "no-store" }).then(r => r.json());

type LinkStatus = {
  linked: boolean;
  telegramId?: string;
  linkedAt?: string;
};

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim();
const BOT_LINK = BOT_USERNAME ? `https://t.me/${BOT_USERNAME}` : "https://telegram.me";

function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function TelegramBotPanel() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<LinkStatus>("/api/telegram/link", fetcher);
  const [unlinking, setUnlinking] = useState(false);

  async function handleUnlink() {
    if (!confirm("Are you sure you want to unlink your Telegram account?")) return;
    setUnlinking(true);
    try {
      const res = await csrfFetch("/api/telegram/link", { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to unlink");
      toast.success("Telegram account unlinked.");
      mutate({ linked: false });
    } catch {
      toast.error("Failed to unlink Telegram account.");
    } finally {
      setUnlinking(false);
    }
  }

  const linkedAt = data?.linkedAt ? new Date(data.linkedAt).toLocaleDateString() : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-white">Telegram Bot</h2>
        <p className="text-sm text-gray-400 mt-1">
          Link your Telegram account to request media and get notifications directly in Telegram.
        </p>
      </div>

      {/* Status card */}
      <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${data?.linked ? "bg-[#229ED9]/20" : "bg-gray-700"}`}>
            <TelegramIcon className={`w-6 h-6 ${data?.linked ? "text-[#229ED9]" : "text-gray-500"}`} />
          </div>

          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="h-4 w-32 bg-gray-700 rounded animate-pulse" />
            ) : data?.linked ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">Connected</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                    ● Active
                  </span>
                </div>
                {linkedAt && (
                  <p className="text-xs text-gray-400 mt-0.5">Linked on {linkedAt}</p>
                )}
              </>
            ) : (
              <>
                <span className="text-sm font-medium text-gray-300">Not connected</span>
                <p className="text-xs text-gray-500 mt-0.5">
                  Message <span className="text-gray-400">/link</span> to the bot, then click{" "}
                  <a href="/telegram-link" className="text-[#229ED9] hover:underline">Link account</a>
                </p>
              </>
            )}
          </div>

          {!isLoading && data?.linked && (
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              className="text-sm text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors shrink-0"
            >
              {unlinking ? "Unlinking…" : "Unlink"}
            </button>
          )}
          {!isLoading && !data?.linked && (
            <a
              href="/telegram-link"
              className="text-sm px-3 py-1.5 rounded-lg bg-[#229ED9]/20 text-[#229ED9] hover:bg-[#229ED9]/30 transition-colors shrink-0"
            >
              Link account
            </a>
          )}
        </div>
      </div>

      {/* Link instructions (shown when not linked) */}
      {!isLoading && !data?.linked && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">How to connect</h3>
          <ol className="space-y-3 text-sm text-gray-300">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#229ED9]/20 text-[#229ED9] flex items-center justify-center text-xs font-bold">1</span>
              <span>
                Open{" "}
                <a
                  href={BOT_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#229ED9] hover:underline font-medium"
                >
                  {BOT_USERNAME ? `@${BOT_USERNAME}` : "the LeMedia Bot"}
                </a>{" "}
                on Telegram and send <code className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">/link</code>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#229ED9]/20 text-[#229ED9] flex items-center justify-center text-xs font-bold">2</span>
              <span>The bot will send you a link code</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#229ED9]/20 text-[#229ED9] flex items-center justify-center text-xs font-bold">3</span>
              <span>Come back here and click <strong className="text-white">Link account</strong> above to enter it</span>
            </li>
          </ol>
          {BOT_USERNAME && (
            <a
              href={BOT_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-lg bg-[#229ED9] hover:bg-[#1a8bc4] text-white text-sm font-medium transition-colors"
            >
              <TelegramIcon className="w-4 h-4" />
              Open @{BOT_USERNAME} in Telegram
            </a>
          )}
        </div>
      )}

      {/* What you can do (shown when linked) */}
      {!isLoading && data?.linked && (
        <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
          <h3 className="text-sm font-semibold text-white mb-3">What you can do</h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-400">
            {[
              { icon: "🎬", text: "/request — Search & request media" },
              { icon: "📋", text: "/mystuff — Your request status" },
              { icon: "🔔", text: "Get notified when media is ready" },
              { icon: "🖥", text: "/services — Service health (admin)" },
            ].map(item => (
              <li key={item.text} className="flex items-start gap-2">
                <span>{item.icon}</span>
                <span>{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
