'use client';

import { useState, useEffect } from 'react';
import { Bell, Loader, Check, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/Providers/ToastProvider';
import { isIOSSafari } from '@/lib/ios-detect';

export function NotificationsSettingsPage() {
  const [isEnabled, setIsEnabled] = useState<boolean | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isIOS, setIsIOS] = useState(false);
  const toast = useToast();

  // Load current preference
  useEffect(() => {
    const loadPreference = async () => {
      try {
        // Check if iOS
        if (isIOSSafari()) {
          setIsIOS(true);
          setIsLoading(false);
          return;
        }

        const res = await fetch('/api/push/preference');
        if (!res.ok) throw new Error('Failed to load preference');
        const data = await res.json();
        setIsEnabled(data.enabled ?? false);
      } catch (error) {
        console.error('Error loading preference:', error);
        setIsEnabled(false);
      } finally {
        setIsLoading(false);
      }
    };

    loadPreference();
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="h-6 w-6 animate-spin text-indigo-400" />
      </div>
    );
  }

  // iOS not supported message
  if (isIOS) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3 mb-2">
            <Bell className="h-6 w-6 text-blue-400" />
            Web Push Notifications
          </h2>
          <p className="text-slate-400">
            Manage browser push notifications for requests, approvals, and updates
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-6 py-4 flex items-start gap-4">
          <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-200/90">
            <p className="font-semibold mb-2">Web Push Notifications Not Available on iOS</p>
            <p className="text-amber-200/70">
              Unfortunately, iOS Safari does not support the standard Web Push Protocol. Push notifications are only available on:
            </p>
            <ul className="list-disc list-inside text-amber-200/70 mt-2 space-y-1">
              <li>Desktop browsers (Chrome, Firefox, Edge)</li>
              <li>Android devices (Chrome, Firefox)</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-3 mb-2">
          <Bell className="h-6 w-6 text-blue-400" />
          Web Push Notifications
        </h2>
        <p className="text-slate-400">
          Manage browser push notifications for requests, approvals, and updates
        </p>
      </div>

      {/* Enable/Disable Toggle */}
      <div className="glass-strong rounded-xl p-6 border border-slate-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-100 mb-2">Push Notifications</h3>
            <p className="text-sm text-slate-400">
              {isEnabled ? 'Enabled on this device' : 'Not enabled on this device'}
            </p>
          </div>

          <div className="flex gap-3">
            {isEnabled && (
              <button
                onClick={handleTestNotification}
                disabled={isTesting}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isTesting ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Test
                  </>
                )}
              </button>
            )}

            <button
              onClick={handleToggle}
              disabled={isLoading}
              className={`px-6 py-2 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 ${
                isEnabled
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : isEnabled ? (
                <>
                  <Check className="h-4 w-4" />
                  Disable
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Enable
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="glass-strong rounded-xl p-6 border border-slate-700/50">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300">
            <p className="font-semibold mb-2">About Web Push Notifications</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Notifications work even when the app is closed</li>
              <li>Your browser must support Service Workers</li>
              <li>You can disable notifications at any time</li>
              <li>Each device needs to be enabled separately</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
