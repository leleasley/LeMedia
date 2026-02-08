"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { useToast } from "@/components/Providers/ToastProvider";
import { logger } from "@/lib/logger";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function PushNotificationManager() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      setIsSupported(true);
      checkSubscription();
    }
  }, []);

  const checkSubscription = async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
    } catch (err) {
      logger.error("[Push] Error checking subscription", err);
    }
  };

  const getCsrfToken = () => {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta?.getAttribute("content") ?? "";
  };

  const subscribe = async () => {
    setIsLoading(true);
    try {
      // Get VAPID public key
      const vapidResponse = await fetch("/api/push/vapid");
      if (!vapidResponse.ok) {
        throw new Error("Failed to get VAPID key");
      }
      const { publicKey } = await vapidResponse.json();

      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Push notifications permission denied");
        return;
      }

      // Subscribe to push
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Send subscription to server
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": getCsrfToken(),
        },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!response.ok) {
        throw new Error("Failed to save subscription");
      }

      setIsSubscribed(true);
    } catch (err) {
      logger.error("[Push] Subscription failed", err);
      toast.error("Failed to enable push notifications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async () => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // Remove from server
        const endpoint = encodeURIComponent(subscription.endpoint);
        await fetch(`/api/push/subscribe?endpoint=${endpoint}`, {
          method: "DELETE",
          headers: {
            "X-CSRF-Token": getCsrfToken(),
          },
        });
      }

      setIsSubscribed(false);
    } catch (err) {
      logger.error("[Push] Unsubscribe failed", err);
      toast.error("Failed to disable push notifications. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <button
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isLoading}
      className="flex items-center gap-2 rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title={isSubscribed ? "Disable push notifications" : "Enable push notifications"}
    >
      {isSubscribed ? (
        <>
          <BellOff className="h-4 w-4" />
          <span>Disable Notifications</span>
        </>
      ) : (
        <>
          <Bell className="h-4 w-4" />
          <span>Enable Notifications</span>
        </>
      )}
    </button>
  );
}
