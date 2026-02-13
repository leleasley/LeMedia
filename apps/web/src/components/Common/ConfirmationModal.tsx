"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "warning",
  isLoading = false,
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  const gradientColors = {
    danger: "from-red-500 via-rose-500 to-orange-500",
    warning: "from-amber-500 via-orange-500 to-yellow-500",
    info: "from-blue-500 via-indigo-500 to-cyan-500",
  };

  const iconColors = {
    danger: "bg-red-500/10 border-red-500/20 text-red-400",
    warning: "bg-amber-500/10 border-amber-500/20 text-amber-400",
    info: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  };

  const buttonColors = {
    danger: "from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-red-500/25",
    warning: "from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 shadow-amber-500/25",
    info: "from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 shadow-blue-500/25",
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Outer wrapper for animated gradient border */}
      <div className="relative w-full max-w-md animate-in zoom-in-95 fade-in duration-300">
        {/* Animated gradient border glow */}
        <div className={`absolute -inset-[1px] rounded-2xl bg-gradient-to-r ${gradientColors[variant]} opacity-60 blur-sm animate-pulse`} />
        <div className={`absolute -inset-[1px] rounded-2xl bg-gradient-to-r ${gradientColors[variant]} opacity-30`} />
        
        {/* Main modal container */}
        <div 
          className="relative w-full rounded-2xl bg-gradient-to-b from-gray-900/95 via-gray-900/98 to-gray-950 border border-white/10 shadow-2xl backdrop-blur-2xl overflow-hidden"
          role="dialog"
          aria-modal="true"
        >
          <div className="p-6">
            <div className="flex items-start gap-4">
              {/* Icon with glow effect */}
              <div className="relative flex-shrink-0">
                <div className={`absolute inset-0 rounded-xl ${variant === 'danger' ? 'bg-red-500' : variant === 'warning' ? 'bg-amber-500' : 'bg-blue-500'} opacity-20 blur-lg`} />
                <div className={`relative rounded-xl p-3 border ${iconColors[variant]}`}>
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </div>
              
              <div className="flex-1 pt-1">
                <h3 className="text-base font-semibold text-white mb-2">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{message}</p>
              </div>
            </div>
          </div>

          {/* Footer with actions */}
          <div className="relative px-6 py-4 border-t border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                disabled={isLoading}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200 disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r ${buttonColors[variant]}`}
              >
                {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
