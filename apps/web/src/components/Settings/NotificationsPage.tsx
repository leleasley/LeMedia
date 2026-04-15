'use client';

import { useState, useEffect } from 'react';
import { Bell, Loader2, AlertCircle, Smartphone, MonitorSmartphone } from 'lucide-react';
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
      <div className="rounded-2xl md:rounded-3xl overflow-hidden border border-white/10">
        {/* Card header */}
        <div className="relative bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent p-6 border-b border-white/[0.06]">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/30 to-orange-500/20 ring-1 ring-white/20 shadow-lg shadow-amber-500/10">
              <Bell className="h-6 w-6 text-amber-300" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-white">Browser Push</h3>
              <p className="text-sm text-gray-400 mt-0.5">Desktop and mobile alerts</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200 ring-1 ring-amber-500/25">
              Unavailable
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="bg-white/[0.02] p-6">
          <div className="flex items-start gap-4 p-4 rounded-xl bg-amber-500/[0.07] border border-amber-500/20">
            <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-medium text-white">Not supported on iOS Safari</p>
              <p className="mt-1 text-xs text-gray-400">
                Push notifications are available on desktop browsers and Android devices.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isLoadingState = isEnabled === null;
  const isOn = isEnabled === true;

  return (
    <div className="rounded-2xl md:rounded-3xl overflow-hidden border border-white/10">
      {/* Gradient card header */}
      <div className="relative bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-transparent p-6 border-b border-white/[0.06]">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-60" />
        <div className="relative flex items-center gap-4">
          <div className={`flex items-center justify-center w-12 h-12 rounded-xl ring-1 shadow-lg transition-all duration-300 ${
            isOn
              ? "bg-gradient-to-br from-blue-500/35 to-indigo-500/25 ring-blue-400/30 shadow-blue-500/20"
              : "bg-gradient-to-br from-blue-500/15 to-indigo-500/10 ring-white/15 shadow-black/20"
          }`}>
            <Bell className={`h-6 w-6 transition-colors duration-300 ${isOn ? "text-blue-300" : "text-gray-400"}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-white">Browser Push</h3>
            <p className="text-sm text-gray-400 mt-0.5 truncate">Desktop and mobile alerts for requests and releases</p>
          </div>
          {isLoadingState ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/8 px-3 py-1 text-xs font-semibold text-gray-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading
            </span>
          ) : (
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 transition-all duration-300 ${
              isOn
                ? "bg-emerald-500/15 text-emerald-200 ring-emerald-500/25"
                : "bg-white/8 text-gray-400 ring-white/10"
            }`}>
              {isOn ? "Active" : "Inactive"}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="bg-white/[0.02] p-6 space-y-4">
        {/* Toggle row */}
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-black/25 border border-white/[0.07]">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`flex items-center justify-center w-9 h-9 rounded-lg shrink-0 transition-colors duration-300 ${
              isOn ? "bg-emerald-500/20" : "bg-white/8"
            }`}>
              <MonitorSmartphone className={`w-4 h-4 transition-colors duration-300 ${isOn ? "text-emerald-300" : "text-gray-500"}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">
                {isLoadingState ? "Checking status…" : isOn ? "Enabled on this device" : "Disabled on this device"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isOn
                  ? "You'll receive alerts even when the app is closed"
                  : "Enable to get instant alerts for requests and updates"}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isOn}
            onClick={handleToggle}
            disabled={isLoading || isLoadingState}
            className={`ui-switch ui-switch-md shrink-0 transition-colors duration-300 ${isOn ? "bg-blue-600" : "bg-gray-700"} disabled:opacity-60`}
          >
            <span className={`ui-switch-thumb transition-transform duration-200 ${isOn ? "translate-x-6" : "translate-x-0"}`} />
          </button>
        </div>

        {/* Test notification button — shown when enabled */}
        {isOn && (
          <button
            onClick={handleTestNotification}
            disabled={isTesting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-white hover:bg-white/[0.08] transition-colors disabled:opacity-50"
          >
            {isTesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending test…
              </>
            ) : (
              <>
                <Bell className="w-4 h-4" />
                Send test notification
              </>
            )}
          </button>
        )}

        {/* Info footer */}
        <div className="flex items-start gap-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-4">
          <AlertCircle className="w-4 h-4 text-blue-400/80 shrink-0 mt-0.5" />
          <div className="text-xs text-gray-400 space-y-1">
            <p>Each device must be enabled separately</p>
            <p>Your browser must support Service Workers for push to work</p>
          </div>
        </div>
      </div>
    </div>
  );
}


