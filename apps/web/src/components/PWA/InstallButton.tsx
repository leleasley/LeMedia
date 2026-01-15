"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Download, X, Loader2 } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PWAInstallButton({ mobileMenu = false }: { mobileMenu?: boolean } = {}) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check if device is iOS
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(isiOS);

    // Handle beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    // Handle app installed event
    const handleAppInstalled = () => {
      setIsInstallable(false);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Check if app is already installed (PWA installed)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    setIsPrompting(true);
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === "accepted") {
        setIsInstallable(false);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (error) {
      console.error("Installation failed:", error);
    } finally {
      setIsPrompting(false);
      setDeferredPrompt(null);
    }
  };

  // Only show if installable or iOS
  if (!isInstallable && !isIOS) {
    return null;
  }

  const renderIOSModal = () => {
    if (!showIOSModal || !isIOS || !mounted) return null;

    return createPortal(
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-gray-900 p-6 border border-white/10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-white">Install LeMedia on iOS</h2>
            <button
              onClick={() => setShowIOSModal(false)}
              className="rounded-lg hover:bg-gray-800 p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4 text-gray-300">
            <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4">
              <p className="font-semibold text-blue-200 mb-2">📱 Step-by-Step Guide:</p>
              <ol className="space-y-3 text-sm">
                <li className="flex gap-3">
                  <span className="font-bold text-blue-400 shrink-0">1</span>
                  <span>Tap the <strong>Share button</strong> at the bottom of your Safari browser</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-blue-400 shrink-0">2</span>
                  <span>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong></span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-blue-400 shrink-0">3</span>
                  <span>Choose a name for the app (or keep &quot;LeMedia&quot;)</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-blue-400 shrink-0">4</span>
                  <span>Tap <strong>&quot;Add&quot;</strong> in the top-right corner</span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-blue-400 shrink-0">5</span>
                  <span>The app will now appear on your home screen!</span>
                </li>
              </ol>
            </div>

            <p className="text-xs text-gray-500">
              Once installed, you&apos;ll be able to access LeMedia directly from your home screen, enjoy offline functionality, and receive push notifications.
            </p>
          </div>

          <button
            onClick={() => setShowIOSModal(false)}
            className="w-full mt-6 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            Got it!
          </button>
        </div>
      </div>,
      document.body
    );
  };

  if (mobileMenu) {
    // Mobile menu version
    return (
      <>
        {renderIOSModal()}

        <button
          onClick={isIOS ? () => setShowIOSModal(true) : handleInstallClick}
          disabled={isPrompting || (!deferredPrompt && !isIOS)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all duration-200 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white"
        >
          {isPrompting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              {isIOS ? "Install on iOS" : "Install App"}
            </>
          )}
        </button>
      </>
    );
  }

  // Desktop header version - floating button on right
  return (
    <>
      {/* Success Toast */}
      {showSuccess && (
        <div className="fixed bottom-4 right-4 z-50 glass-strong rounded-lg p-4 border border-white/10 border-green-500/50 bg-green-500/20 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400" />
          <p className="text-sm font-medium text-green-200">
            LeMedia installed successfully!
          </p>
        </div>
      )}

      {renderIOSModal()}

      {/* Install Button */}
      <button
        onClick={isIOS ? () => setShowIOSModal(true) : handleInstallClick}
        disabled={isPrompting || (!deferredPrompt && !isIOS)}
        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg hover:shadow-blue-500/50"
        title={isIOS ? "Install on iOS" : "Install LeMedia as an app"}
      >
        {isPrompting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Installing...
          </>
        ) : (
          <>
            <Download className="h-4 w-4" />
            {isIOS ? "Install App" : "Install"}
          </>
        )}
      </button>
    </>
  );
}
