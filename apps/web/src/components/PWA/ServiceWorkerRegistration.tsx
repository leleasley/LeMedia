"use client";

import { useEffect, useRef } from "react";

export function ServiceWorkerRegistration() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const registerSW = () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("[SW] Service Worker registered:", registration.scope);

          // Check for updates periodically - store ref for cleanup
          intervalRef.current = setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000); // Check every hour
        })
        .catch((error) => {
          console.error("[SW] Service Worker registration failed:", error);
        });
    };

    // Register on load or immediately if already loaded
    if (document.readyState === "complete") {
      registerSW();
    } else {
      window.addEventListener("load", registerSW);
    }

    // Cleanup function
    return () => {
      window.removeEventListener("load", registerSW);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return null;
}
