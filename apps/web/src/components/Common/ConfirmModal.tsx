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
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
    >
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-gray-900 shadow-2xl">
        <div className="flex items-start gap-3 p-5">
          <div className={`mt-0.5 rounded-full p-2 ${destructive ? "bg-red-500/10" : "bg-amber-500/10"}`}>
            <AlertTriangle className={`h-5 w-5 ${destructive ? "text-red-400" : "text-amber-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 id="confirm-title" className="text-sm font-semibold text-white">
              {title}
            </h3>
            <p id="confirm-message" className="mt-1 text-sm text-gray-400">
              {message}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 p-1 text-gray-500 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-white/5 px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
              destructive
                ? "bg-red-600 hover:bg-red-500"
                : "bg-indigo-600 hover:bg-indigo-500"
            }`}
          >
            {confirmLabel}
          </button>
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
