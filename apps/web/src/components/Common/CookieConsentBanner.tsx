"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { getCookieConsent, setCookieConsent } from "@/lib/cookie-consent";
import { X } from "lucide-react";

export function CookieConsentBanner() {
  const [overrideConsent, setOverrideConsent] = useState<"accepted" | "declined" | null | undefined>(undefined);
  const storedConsent = useSyncExternalStore(
    () => () => {},
    () => getCookieConsent(),
    () => "accepted"
  );
  const consent = overrideConsent ?? storedConsent;

  const handleAccept = () => {
    setCookieConsent("accepted");
    setOverrideConsent("accepted");
  };

  const handleDecline = () => {
    setCookieConsent("declined");
    setOverrideConsent("declined");
  };

  if (consent !== null) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 border-t border-gray-700 backdrop-blur-sm animate-in slide-in-from-bottom-4 duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white mb-2">Cookie & Privacy Notice</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              We use cookies to maintain your session and protect your account. We also send data to Cloudflare for security via Turnstile.{" "}
              <Link href="/privacy" className="text-blue-400 hover:text-blue-300 underline">
                Privacy Policy
              </Link>
              {" "}·{" "}
              <Link href="/cookies" className="text-blue-400 hover:text-blue-300 underline">
                Cookies Policy
              </Link>
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0 w-full sm:w-auto">
            <button
              onClick={handleDecline}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-gray-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors border border-gray-600 hover:border-gray-500"
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-black bg-white hover:bg-gray-100 rounded-lg transition-colors"
            >
              Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
