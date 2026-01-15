'use client';

import { useEffect, useState } from 'react';
import { Bell, X, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/Providers/ToastProvider';
import { isIOSSafari } from '@/lib/ios-detect';
import { csrfFetch } from '@/lib/csrf-client';

export function WebPushPrompt() {
  const [shown, setShown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const toast = useToast();

  useEffect(() => {
    checkWebPushStatus();
  }, []);

  const checkWebPushStatus = async () => {
    try {
      // Don't show prompt for iOS users
      if (isIOSSafari()) {
        setIsIOS(true);
        return;
      }

      // Check if browser supports notifications
      if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        return;
      }

      // If user already denied permission, don't show prompt
      if (Notification.permission === 'denied') {
        return;
      }

      // If user already granted permission, check if this device has an active subscription
      if (Notification.permission === 'granted') {
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();

          // If this device has an active subscription, don't show prompt
          if (subscription) {
            return;
          }
          // If granted but no subscription, show prompt to re-subscribe
          setShown(true);
        } catch (err) {
          console.error('Error checking subscription:', err);
        }
        return;
      }

      // Permission is "default" (never asked) - check user preference
      const res = await fetch('/api/push/preference');
      if (!res.ok) return;

      const data = await res.json();

      // Only show prompt if they haven't made a choice yet (null = not prompted on any device)
      if (data.enabled === null) {
        setShown(true);
      }
    } catch (error) {
      console.error('Error checking web push status:', error);
    }
  };

  const handleEnable = async () => {
    setIsLoading(true);
    try {
      // Check if Notification API is supported
      if (!('Notification' in window)) {
        toast.error('Notifications are not supported in this browser');
        setIsLoading(false);
        return;
      }

      // Check if service worker is supported
      if (!('serviceWorker' in navigator)) {
        toast.error('Service workers are not supported in this browser');
        setIsLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.ready;

      if (!('pushManager' in registration)) {
        toast.error('Push notifications are not supported in this browser');
        setIsLoading(false);
        return;
      }

      // Request permission
      console.log('Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('Permission result:', permission);
      
      if (permission !== 'granted') {
        // User denied - mark as disabled
        await savePreference(false);
        toast.info('Notifications disabled. You can enable them later in settings.');
        setShown(false);
        return;
      }

      // Get VAPID key
      const vapidRes = await fetch('/api/push/vapid');
      const { publicKey } = await vapidRes.json();

      if (!publicKey) {
        toast.error('VAPID key not configured');
        setIsLoading(false);
        return;
      }

      // Convert the VAPID key from URL-safe base64 to Uint8Array
      console.log('Subscribing to push with VAPID key...');
      let vapidKeyArray;
      try {
        // URL-safe base64 to regular base64
        const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        vapidKeyArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          vapidKeyArray[i] = rawData.charCodeAt(i);
        }
      } catch (error) {
        console.error('Failed to decode VAPID key:', error);
        toast.error('Invalid VAPID key format');
        setIsLoading(false);
        return;
      }

      // Subscribe to push
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyArray,
      });
      console.log('Push subscription successful:', subscription);

      // Save subscription to server
      const saveRes = await csrfFetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
      });

      if (!saveRes.ok) throw new Error('Failed to save subscription');

      // Mark as enabled in user preferences
      await savePreference(true);

      toast.success('Notifications enabled! You can manage them in settings.');
      setShown(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enable notifications';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    setIsLoading(true);
    try {
      await savePreference(false);
      toast.info('Notifications disabled. You can enable them later in settings.');
      setShown(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update preference';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const savePreference = async (enabled: boolean) => {
    const res = await csrfFetch('/api/push/preference', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ enabled }),
    });

    if (!res.ok) throw new Error('Failed to save preference');
  };

  // Don't show anything for iOS users
  if (isIOS) return null;

  if (!shown) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="glass-strong rounded-2xl p-6 max-w-md w-full border border-slate-700/50 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="flex items-start gap-4">
          <div className="bg-blue-500/20 p-3 rounded-lg flex-shrink-0">
            <Bell className="h-6 w-6 text-blue-400" />
          </div>

          <div className="flex-1">
            <h2 className="text-xl font-bold text-slate-100 mb-2">
              Stay Updated with Notifications
            </h2>
            <p className="text-sm text-slate-300 mb-4">
              Enable push notifications so you don&apos;t miss important updates about your requests, approvals, and library changes.
            </p>

            <ul className="text-sm text-slate-400 space-y-2 mb-6">
              <li className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-blue-400" />
                Get notified when requests are approved
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-blue-400" />
                Receive library update alerts
              </li>
              <li className="flex items-center gap-2">
                <div className="h-1 w-1 rounded-full bg-blue-400" />
                Never miss important announcements
              </li>
            </ul>

            <div className="flex gap-3">
              <button
                onClick={handleEnable}
                disabled={isLoading}
                className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Enabling...' : 'Enable Notifications'}
              </button>
              <button
                onClick={handleDisable}
                disabled={isLoading}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold transition-colors disabled:opacity-50"
              >
                Not Now
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-4">
              You can change this at any time in your profile settings.
            </p>
          </div>

          <button
            onClick={() => handleDisable()}
            className="text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0 p-1"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
