"use client";

import { useEffect } from "react";

// Register service worker for PWA and push notifications
// This replaces the old "reset" behavior which was breaking push subscriptions
export function ServiceWorkerReset() {
    useEffect(() => {
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
            return;
        }

        const registerServiceWorker = async () => {
            try {
                // Check if we already have a registered service worker
                const existingRegs = await navigator.serviceWorker.getRegistrations();
                const hasOurSw = existingRegs.some(reg => reg.active?.scriptURL.includes("/sw.js"));

                if (hasOurSw) {
                    console.log("[SW] Service worker already registered");
                    // Update existing registration
                    const registration = await navigator.serviceWorker.ready;
                    registration.update();
                    return;
                }

                // Register service worker
                const registration = await navigator.serviceWorker.register("/sw.js", {
                    scope: "/",
                });

                console.log("[SW] Service Worker registered:", registration.scope);

                // Handle updates
                registration.addEventListener("updatefound", () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.addEventListener("statechange", () => {
                            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                                console.log("[SW] New service worker available");
                            }
                        });
                    }
                });
            } catch (error) {
                console.error("[SW] Service Worker registration failed:", error);
            }
        };

        // Register when the page loads
        if (document.readyState === "complete") {
            registerServiceWorker();
        } else {
            window.addEventListener("load", registerServiceWorker);
            return () => window.removeEventListener("load", registerServiceWorker);
        }
    }, []);

    return null;
}
