'use client';

import { useState, useEffect } from 'react';
import { Bell, Loader2, Check, AlertCircle, Smartphone } from 'lucide-react';
import { useToast } from '@/components/Providers/ToastProvider';
import { isIOSSafari } from '@/lib/ios-detect';

interface NotificationsSettingsPageProps {
  initialEnabled?: boolean | null;
}

export function NotificationsSettingsPage({ initialEnabled }: NotificationsSettingsPageProps) {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(initialEnabled ?? null);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const toast = useToast();

  // Sync with initialEnabled prop
  useEffect(() => {
    if (initialEnabled !== undefined && initialEnabled !== null) {
      setIsEnabled(initialEnabled);
    }
  }, [initialEnabled]);

  // Check for iOS on mount
  useEffect(() => {
    if (isIOSSafari()) {
      setIsIOS(true);
    }
  }, []);

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      const newState = !isEnabled;
      
      // If enabling, check browser support and request permission
      if (newState) {
        if (!('Notification' in window)) {
          throw new Error('Notifications are not supported in this browser');
        }

        if (!('serviceWorker' in navigator)) {
          throw new Error('Service workers are not supported in this browser');
        }

        const registration = await navigator.serviceWorker.ready;

        if (!('pushManager' in registration)) {
          throw new Error('Push notifications are not supported in this browser');
        }

        // Request permission
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.error('Notification permission denied');
          setIsLoading(false);
          return;
        }

        // Get VAPID key
        const vapidRes = await fetch('/api/push/vapid');
        const { publicKey } = await vapidRes.json();

        if (!publicKey) {
          throw new Error('VAPID key not configured');
        }

        // Convert URL-safe base64 VAPID key to Uint8Array
        const base64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        const vapidKeyArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; i++) {
          vapidKeyArray[i] = rawData.charCodeAt(i);
        }

        // Subscribe to push
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKeyArray,
        });

        // Get CSRF token
        const csrfRes = await fetch('/api/csrf');
        const { token } = await csrfRes.json();

        // Save subscription to server
        const saveRes = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': token,
          },
          body: JSON.stringify(subscription),
        });

        if (!saveRes.ok) throw new Error('Failed to save subscription');
      }

      // Save preference
      const csrfRes = await fetch('/api/csrf');
      const { token } = await csrfRes.json();

      const res = await fetch('/api/push/preference', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
        },
        body: JSON.stringify({ enabled: newState }),
      });

      if (!res.ok) throw new Error('Failed to save preference');

      setIsEnabled(newState);
      toast.success(newState ? 'Notifications enabled' : 'Notifications disabled');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update preference';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestNotification = async () => {
    if (!isEnabled) {
      toast.error('Enable notifications first');
      return;
    }

    setIsTesting(true);
    try {
      const csrfRes = await fetch('/api/csrf');
      const { token } = await csrfRes.json();

      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': token,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send test notification');
      }

      toast.success(data.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send test notification';
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  // iOS not supported - show within card
  if (isIOS) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-amber-300/30 bg-gradient-to-br from-amber-900/40 via-orange-900/30 to-slate-950 p-6 md:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-amber-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-14 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />

        <div className="relative mb-6 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200/30 bg-amber-500/20">
            <Bell className="h-6 w-6 text-amber-100" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-white">Browser Push Alerts</h3>
            <p className="mt-1 text-sm text-amber-100/80">This browser can&apos;t register Web Push right now.</p>
          </div>
          <div className="rounded-full border border-amber-200/30 bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-100">
            Unavailable
          </div>
        </div>

        <div className="relative rounded-2xl border border-amber-200/25 bg-black/25 p-5 backdrop-blur">
          <div className="flex items-start gap-4">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-200" />
            <div>
              <p className="mb-2 font-semibold text-amber-100">Not available on iOS Safari</p>
              <p className="mb-3 text-sm text-amber-100/80">
                iOS Safari doesn&apos;t support the Web Push Protocol. Push notifications are available on:
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/25 bg-black/30 px-3 py-1 text-xs text-amber-100">
                  <span>💻</span> Desktop browsers
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/25 bg-black/30 px-3 py-1 text-xs text-amber-100">
                  <span>📱</span> Android devices
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-cyan-300/25 bg-gradient-to-br from-cyan-900/30 via-slate-900 to-blue-950/30 p-6 md:p-8">
      <div className="pointer-events-none absolute -top-20 -right-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative mb-6 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/30 bg-cyan-400/20">
          <Bell className="h-6 w-6 text-cyan-100" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white">Browser Push Alerts</h3>
          <p className="mt-1 text-sm text-cyan-100/80">Instant desktop and mobile alerts for requests and releases.</p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${
          isEnabled === null
            ? 'border-white/20 bg-white/10 text-slate-200'
            : isEnabled
              ? 'border-emerald-300/30 bg-emerald-500/20 text-emerald-100'
              : 'border-white/20 bg-white/10 text-slate-200'
        }`}>
          {isEnabled === null ? 'Loading...' : isEnabled ? 'Active' : 'Inactive'}
        </div>
      </div>

      {/* Main toggle area */}
      <div className="relative mb-5 rounded-2xl border border-white/15 bg-black/25 p-4 backdrop-blur">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 text-sm font-semibold text-white">
            {isEnabled ? 'Push notifications are enabled' : 'Push notifications are disabled'}
          </div>
          <div className="text-xs text-slate-300/80">
            {isEnabled
              ? 'You\'ll receive notifications even when the app is closed'
              : 'Enable to get instant alerts for requests and updates'}
          </div>
        </div>
        <div className="flex gap-2">
          {isEnabled && (
            <button
              onClick={handleTestNotification}
              disabled={isTesting}
              className="inline-flex items-center gap-2 rounded-lg border border-cyan-200/30 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/20 disabled:opacity-50"
            >
              {isTesting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  Test
                </>
              )}
            </button>
          )}
          <button
            onClick={handleToggle}
            disabled={isLoading}
            className={`inline-flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
              isEnabled
                ? 'border border-red-300/30 bg-red-500/20 text-red-100 hover:bg-red-500/30'
                : 'border border-emerald-300/30 bg-emerald-500/30 text-emerald-50 hover:bg-emerald-500/40'
            }`}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {isEnabled ? 'Disabling...' : 'Enabling...'}
              </>
            ) : isEnabled ? (
              'Disable'
            ) : (
              <>
                <Check className="w-4 h-4" />
                Enable
              </>
            )}
          </button>
        </div>
      </div>
      </div>

      {/* Info section */}
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-gray-400 space-y-1">
            <p>Push notifications work across all your devices - each needs to be enabled separately</p>
            <p>Your browser must support Service Workers for notifications to work</p>
          </div>
        </div>
      </div>
    </div>
  );
}
