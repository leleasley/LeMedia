"use client";

import { useState } from "react";

export default function TelegramLinkForm() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const csrfRes = await fetch("/api/csrf", { credentials: "include" });
      const { token: csrfToken } = await csrfRes.json();

      const res = await fetch("/api/telegram/link", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken
        },
        body: JSON.stringify({ code: code.trim().toUpperCase() })
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setMessage(
        data.telegramUsername
          ? `Successfully linked to @${data.telegramUsername}! You can now use the bot.`
          : "Successfully linked! You can now use the Telegram bot."
      );
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <>
      {status === "success" ? (
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-green-400 font-medium mb-2">Linked!</p>
          <p className="text-gray-300 text-sm">{message}</p>
          <p className="text-gray-500 text-sm mt-4">
            Head back to Telegram and send{" "}
            <span className="font-mono bg-gray-700 px-1.5 py-0.5 rounded text-gray-300">/start</span>
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Link Code
            </label>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. AB12-CD34"
              maxLength={20}
              className="w-full px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#229ED9] focus:border-transparent font-mono text-center text-lg tracking-widest uppercase"
              disabled={status === "loading"}
              autoFocus
            />
          </div>

          {status === "error" && (
            <p className="text-red-400 text-sm text-center">{message}</p>
          )}

          <button
            type="submit"
            disabled={status === "loading" || !code.trim()}
            className="w-full py-3 px-4 bg-[#229ED9] hover:bg-[#1a8bc4] disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200"
          >
            {status === "loading" ? "Linking…" : "Link Account"}
          </button>
        </form>
      )}
    </>
  );
}
