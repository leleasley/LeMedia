"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
    >
      {/* Outer wrapper for animated gradient border */}
      <div className="relative w-full max-w-md animate-in zoom-in-95 fade-in duration-300">
        {/* Animated gradient border glow */}
        <div className={`absolute -inset-[1px] rounded-2xl ${destructive ? "bg-gradient-to-r from-red-500 via-rose-500 to-orange-500" : "bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500"} opacity-60 blur-sm animate-pulse`} />
        <div className={`absolute -inset-[1px] rounded-2xl ${destructive ? "bg-gradient-to-r from-red-500 via-rose-500 to-orange-500" : "bg-gradient-to-r from-amber-500 via-orange-500 to-yellow-500"} opacity-30`} />
        
        {/* Main modal container */}
        <div className="relative w-full rounded-2xl bg-gradient-to-b from-gray-900/95 via-gray-900/98 to-gray-950 border border-white/10 shadow-2xl backdrop-blur-2xl overflow-hidden">
          <div className="p-6">
            <div className="flex items-start gap-4">
              {/* Icon with glow effect */}
              <div className="relative flex-shrink-0">
                <div className={`absolute inset-0 rounded-xl ${destructive ? "bg-red-500" : "bg-amber-500"} opacity-20 blur-lg`} />
                <div className={`relative rounded-xl p-3 ${destructive ? "bg-red-500/10 border border-red-500/20" : "bg-amber-500/10 border border-amber-500/20"}`}>
                  <AlertTriangle className={`h-6 w-6 ${destructive ? "text-red-400" : "text-amber-400"}`} />
                </div>
              </div>
              
              <div className="flex-1 min-w-0 pt-1">
                <h3 id="confirm-title" className="text-base font-semibold text-white">
                  {title}
                </h3>
                <p id="confirm-message" className="mt-2 text-sm text-gray-400 leading-relaxed">
                  {message}
                </p>
              </div>
              
              <button
                type="button"
                onClick={onCancel}
                className="flex-shrink-0 p-2 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          
          {/* Footer with actions */}
          <div className="relative px-6 py-4 border-t border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 shadow-lg ${
                  destructive
                    ? "bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-red-500/25"
                    : "bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 shadow-indigo-500/25"
                }`}
              >
                {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ConfirmOptions {
  title?: string;
  destructive?: boolean;
  confirmLabel?: string;
}

export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean;
    message: string;
    title?: string;
    destructive?: boolean;
    confirmLabel?: string;
  }>({ open: false, message: "" });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback(
    (message: string, opts?: ConfirmOptions) => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setState({ open: true, message, ...opts });
      });
    },
    []
  );

  const onConfirm = useCallback(() => {
    resolveRef.current?.(true);
    setState({ open: false, message: "" });
  }, []);

  const onCancel = useCallback(() => {
    resolveRef.current?.(false);
    setState({ open: false, message: "" });
  }, []);

  const modalProps: ConfirmModalProps = {
    open: state.open,
    message: state.message,
    title: state.title,
    destructive: state.destructive,
    confirmLabel: state.confirmLabel,
    onConfirm,
    onCancel,
  };

  return { confirm, modalProps } as const;
}
