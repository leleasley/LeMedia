import { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { getDeviceId } from '@/utils/deviceId';

interface PushState {
  supported: boolean;
  permission: NotificationPermission | 'unsupported';
  subscribed: boolean;
  loading: boolean;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: 'unsupported',
    subscribed: false,
    loading: true,
  });

  // Check initial state
  useEffect(() => {
    async function check() {
      const supported = 'PushManager' in globalThis && 'serviceWorker' in navigator;
      if (!supported) {
        setState({ supported: false, permission: 'unsupported', subscribed: false, loading: false });
        return;
      }

      const permission = Notification.permission;
      let subscribed = false;

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        subscribed = !!subscription;
        // Re-register on load: refreshes "last seen" and, on an older install, attaches the
        // device id so a future endpoint rotation can replace this row instead of adding one.
        if (subscription) {
          const deviceId = getDeviceId();
          await api.post('/push/subscribe', {
            ...subscription.toJSON(),
            deviceId,
            userAgent: navigator.userAgent,
          }).catch(() => {});
        }
      } catch {
        // Service worker not ready yet
      }

      setState({ supported, permission, subscribed, loading: false });
    }
    check();
  }, []);

  const subscribe = useCallback(async () => {
    try {
      // Ask for permission FIRST, straight from the tap. iOS only shows the prompt while the
      // user gesture is still live — awaiting a network call beforehand can silently lose it.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(prev => ({ ...prev, permission, loading: false }));
        return false;
      }
      setState(prev => ({ ...prev, permission, loading: true }));

      // Then fetch the server's VAPID key
      const { data } = await api.get('/app/vapid-key');
      if (!data.key) throw new Error('Push not configured on server');

      // Subscribe
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.key).buffer as ArrayBuffer,
      });

      // Send to backend
      await api.post('/push/subscribe', {
        ...subscription.toJSON(),
        deviceId: getDeviceId(),
        userAgent: navigator.userAgent,
      });

      setState({ supported: true, permission: 'granted', subscribed: true, loading: false });
      return true;
    } catch (err) {
      console.error('[Push] Subscribe failed:', err);
      setState(prev => ({ ...prev, loading: false }));
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, loading: true }));

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        // Browser subscription is now gone — update state immediately
        setState(prev => ({ ...prev, subscribed: false }));
        // Backend cleanup is best-effort
        await api.delete('/push/unsubscribe', { data: { endpoint: subscription.endpoint } }).catch(() => {});
      }

      setState(prev => ({ ...prev, subscribed: false, loading: false }));
      return true;
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
      setState(prev => ({ ...prev, subscribed: false, loading: false })); // Browser unsub may have succeeded
      return false;
    }
  }, []);

  return { ...state, subscribe, unsubscribe };
}

// Helper: convert base64 VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replaceAll(/-/g, '+').replaceAll(/_/g, '/');
  const rawData = globalThis.atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}
