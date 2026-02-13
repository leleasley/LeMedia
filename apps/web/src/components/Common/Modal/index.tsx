"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { X } from "lucide-react";

export function Modal(props: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  backgroundImage?: string;
  forceCenter?: boolean;
}) {
  const { open, title, children, onClose, backgroundImage, forceCenter } = props;
  const contentRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleClose = useCallback(() => {
    onCloseRef.current();
  }, []);

  // Lock body scroll when modal is open
  useLockBodyScroll(open);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };

    window.addEventListener("keydown", onKeyDown);

    // focus first focusable element inside modal
    const timer = setTimeout(() => {
      const root = contentRef.current;
      if (!root) return;
      const focusable = root.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      focusable?.focus();
    }, 10);

    // CLEANUP FUNCTION
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimeout(timer);
    };
  }, [open]);

  if (!open) return null;

  const overlay = (
    <div
      className={`fixed inset-0 z-[1000] flex ${forceCenter ? "items-center" : "items-end sm:items-center"} justify-center bg-black/80 backdrop-blur-xl p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-300`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      {/* Outer wrapper for animated gradient border */}
      <div className="relative w-full sm:max-w-xl animate-in fade-in slide-in-from-bottom-6 sm:zoom-in-95 duration-300">
        {/* Animated gradient border glow */}
        <div className="absolute -inset-[1px] rounded-t-3xl sm:rounded-3xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-60 blur-sm animate-pulse" />
        <div className="absolute -inset-[1px] rounded-t-3xl sm:rounded-3xl bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 opacity-30" />
        
        {/* Main modal container */}
        <div
          ref={contentRef}
          className="relative w-full rounded-t-3xl sm:rounded-3xl bg-gradient-to-b from-gray-900/95 via-gray-900/98 to-gray-950 border-t sm:border border-white/10 shadow-[0_0_50px_rgba(99,102,241,0.15)] overflow-hidden max-h-[85vh] sm:max-h-[90vh] backdrop-blur-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Background image ambient effect */}
          {backgroundImage && (
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <div 
                className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-15"
                style={{ backgroundImage: `url(${backgroundImage})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-b from-gray-900/70 via-gray-900/90 to-gray-900" />
            </div>
          )}
          
          {/* Header with animated gradient */}
          <div className="relative px-5 sm:px-6 pt-5 sm:pt-6 pb-4 sm:pb-5">
            {/* Subtle animated background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5" />
            <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            
            <div className="relative flex items-center justify-between gap-4">
              <h2 className="text-lg sm:text-xl font-semibold text-white tracking-tight">{title}</h2>
              <button
                type="button"
                className="group flex items-center justify-center w-9 h-9 rounded-xl bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-200"
                onClick={handleClose}
                aria-label="Close"
              >
                <X className="w-4 h-4 transition-transform duration-200 group-hover:scale-110" />
              </button>
            </div>
          </div>
          
          {/* Content area */}
          <div className="relative px-5 sm:px-6 pb-5 sm:pb-6 overflow-y-auto max-h-[calc(85vh-80px)] sm:max-h-[calc(90vh-80px)]">
            <div className="text-sm text-gray-300">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
