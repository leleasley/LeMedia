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
      <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 ring-1 ring-white/10">
            <Bell className="w-6 h-6 text-blue-300" />
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-white">Web Push Notifications</h3>
            <p className="text-sm text-gray-400 mt-1">Receive instant updates in your browser</p>
          </div>
          <div className="rounded-full px-3 py-1 text-xs font-semibold bg-amber-500/20 text-amber-200">
            Unavailable
          </div>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-5">
          <div className="flex items-start gap-4">
            <Smartphone className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200 mb-2">Not available on iOS Safari</p>
              <p className="text-sm text-amber-200/70 mb-3">
                iOS Safari doesn&apos;t support the Web Push Protocol. Push notifications are available on:
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs text-amber-200/80">
                  <span>💻</span> Desktop browsers
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-black/20 px-3 py-1 text-xs text-amber-200/80">
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
    <div className="rounded-2xl md:rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
      <div className="flex items-center gap-4 mb-6">
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 ring-1 ring-white/10">
          <Bell className="w-6 h-6 text-blue-300" />
        </div>
        <div className="flex-1">
          <h3 className="text-xl font-bold text-white">Web Push Notifications</h3>
          <p className="text-sm text-gray-400 mt-1">Receive instant updates in your browser</p>
        </div>
        <div className={`rounded-full px-3 py-1 text-xs font-semibold ${
          isEnabled === null
            ? 'bg-white/10 text-gray-300'
            : isEnabled
              ? 'bg-emerald-500/20 text-emerald-200'
              : 'bg-white/10 text-gray-300'
        }`}>
          {isEnabled === null ? 'Loading...' : isEnabled ? 'Active' : 'Inactive'}
        </div>
      </div>

      {/* Main toggle area */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-black/20 border border-white/5 mb-5">
        <div>
          <div className="text-sm text-white font-medium mb-1">
            {isEnabled ? 'Push notifications are enabled' : 'Push notifications are disabled'}
          </div>
          <div className="text-xs text-gray-400">
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
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-50"
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
                ? 'bg-red-500/20 text-red-200 hover:bg-red-500/30'
                : 'bg-emerald-600 text-white hover:bg-emerald-500'
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

      {/* Info section */}
      <div className="rounded-lg bg-white/5 border border-white/5 p-4">
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
