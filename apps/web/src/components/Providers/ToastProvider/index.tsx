"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X, CheckCircle, AlertCircle, Info } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export type ToastInput = {
  type: ToastType;
  title?: React.ReactNode;
  message: React.ReactNode;
  timeoutMs?: number;
  dedupeKey?: string;
};

type Toast = ToastInput & { id: string; closing?: boolean };

type ToastApi = {
  push: (toast: ToastInput) => void;
  success: (message: React.ReactNode, opts?: { title?: React.ReactNode; timeoutMs?: number }) => void;
  error: (message: React.ReactNode, opts?: { title?: React.ReactNode; timeoutMs?: number }) => void;
  info: (message: React.ReactNode, opts?: { title?: React.ReactNode; timeoutMs?: number }) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function makeId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function stylesFor(type: ToastType) {
  if (type === "success") return {
    container: "border-green-500/40 bg-green-500/10 text-green-300",
    icon: <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
  };
  if (type === "error") return {
    container: "border-red-500/40 bg-red-500/10 text-red-300",
    icon: <AlertCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
  };
  return {
    container: "border-blue-500/40 bg-blue-500/10 text-blue-300",
    icon: <Info className="h-5 w-5 text-blue-400 flex-shrink-0" />
  };
}

export function ToastProvider(props: { children: React.ReactNode; initialToasts?: ToastInput[] }) {
  const timeouts = useRef(new Map<string, number>());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const didInit = useRef(false);

  const remove = useCallback((id: string) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, closing: true } : t));
    setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
        timeouts.current.delete(id);
    }, 300); // Wait for animation
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = makeId();
      const timeoutMs = toast.timeoutMs ?? 4000;
      setToasts(prev => [{ ...toast, id }, ...prev].slice(0, 3));
      if (timeoutMs > 0) {
        const t = window.setTimeout(() => remove(id), timeoutMs);
        timeouts.current.set(id, t);
      }
    },
    [remove]
  );

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const initial = props.initialToasts ?? [];
    const toEnqueue: ToastInput[] = [];
    for (let i = initial.length - 1; i >= 0; i--) {
      const t = initial[i];
      if (t?.dedupeKey) {
        // Use a timestamp-based key to allow the same message type to show again after 5 seconds
        const key = `lemedia_toast_seen:${t.dedupeKey}`;
        const lastSeen = sessionStorage.getItem(key);
        const now = Date.now();
        if (lastSeen && (now - parseInt(lastSeen, 10)) < 5000) continue;
        sessionStorage.setItem(key, String(now));
      }
      toEnqueue.push(t);
    }
    if (!toEnqueue.length) return;

    const timeout = window.setTimeout(() => {
      for (const t of toEnqueue) push(t);
    }, 100); // Small delay to ensure DOM is ready
    return () => window.clearTimeout(timeout);
  }, [props.initialToasts, push]);

  const api: ToastApi = useMemo(
    () => ({
      push,
      success: (message, opts) => push({ type: "success", message, title: opts?.title, timeoutMs: opts?.timeoutMs }),
      error: (message, opts) => push({ type: "error", message, title: opts?.title, timeoutMs: opts?.timeoutMs }),
      info: (message, opts) => push({ type: "info", message, title: opts?.title, timeoutMs: opts?.timeoutMs })
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {props.children}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-full max-w-md px-4 pointer-events-none"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
      >
        {toasts.map(t => {
          const s = stylesFor(t.type);
          return (
            <div
              key={t.id}
              className={`
                pointer-events-auto
                rounded-xl border backdrop-blur-md shadow-lg px-4 py-3
                flex items-start gap-3 transition-all duration-300 ease-out
                ${s.container}
                ${t.closing ? "opacity-0 -translate-y-4 scale-95" : "opacity-100 translate-y-0 scale-100"}
              `}
              role="status"
              aria-live="polite"
            >
              {s.icon}
              <div className="flex-1 min-w-0 pt-0.5">
                {t.title ? <div className="font-semibold text-sm mb-0.5">{t.title}</div> : null}
                <div className="text-sm opacity-90 break-words leading-tight">{t.message}</div>
              </div>
              <button
                type="button"
                onClick={() => remove(t.id)}
                className="shrink-0 p-0.5 opacity-60 hover:opacity-100 transition-opacity"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
