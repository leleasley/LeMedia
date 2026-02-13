"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";

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

  const modalStyle = backgroundImage
    ? {
        backgroundImage: `linear-gradient(180deg, rgba(17, 24, 39, 0.85) 0%, rgba(17, 24, 39, 0.98) 100%), url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center"
      }
    : undefined;

  const overlay = (
    <div
      className={`fixed inset-0 z-[1000] flex ${forceCenter ? "items-center" : "items-end sm:items-center"} justify-center bg-black/80 backdrop-blur-md p-0 sm:p-4 overflow-y-auto animate-in fade-in duration-200`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={contentRef}
        className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl glass-strong border-t sm:border border-white/10 shadow-2xl overflow-hidden max-h-[85vh] sm:max-h-[90vh] animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="relative px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-white/10" style={modalStyle}>
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10" />
          <div className="relative flex items-center justify-between">
            <h2 className="text-base sm:text-xl font-bold text-white tracking-tight">{title}</h2>
            <button
              type="button"
              className="text-gray-400 hover:text-white transition-all duration-200 p-2 hover:bg-white/10 rounded-lg"
              onClick={handleClose}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(85vh-80px)] sm:max-h-[calc(90vh-80px)]" style={backgroundImage ? modalStyle : undefined}>
          <div className="text-sm">{children}</div>
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return overlay;
  return createPortal(overlay, document.body);
}
