import "server-only";
import webpush from "web-push";
import { z } from "zod";

const VapidPublicKeySchema = z.string().min(1);
const VapidPrivateKeySchema = z.string().min(1);
const VapidEmailSchema = z.string().email();

let vapidConfigured = false;
const isBuildPhase = () => process.env.NEXT_PHASE === "phase-production-build";

export function configureWebPush() {
  if (vapidConfigured) return;

  try {
    const publicKey = VapidPublicKeySchema.parse(process.env.VAPID_PUBLIC_KEY);
    const privateKey = VapidPrivateKeySchema.parse(process.env.VAPID_PRIVATE_KEY);
    const email = VapidEmailSchema.parse(process.env.VAPID_EMAIL ?? "noreply@localhost");

    webpush.setVapidDetails(`mailto:${email}`, publicKey, privateKey);
    vapidConfigured = true;
  } catch (err) {
    if (!isBuildPhase()) {
      console.warn("[WebPush] VAPID keys not configured. Push notifications will not work.");
    }
  }
}

export function getVapidPublicKey(): string | null {
  try {
    return VapidPublicKeySchema.parse(process.env.VAPID_PUBLIC_KEY);
  } catch {
    return null;
  }
}

export async function sendPushNotification(
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  },
  payload: {
    title: string;
    body: string;
    icon?: string;
    url?: string;
    tag?: string;
    requireInteraction?: boolean;
  }
): Promise<{ success: boolean; shouldDelete: boolean }> {
  if (!vapidConfigured) {
    configureWebPush();
  }

  if (!vapidConfigured) {
    return { success: false, shouldDelete: false };
  }

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      JSON.stringify(payload)
    );
    return { success: true, shouldDelete: false };
  } catch (err: any) {
    console.error("[WebPush] Failed to send notification:", err);

    // Check if subscription is expired/invalid (410 or 404)
    if (err.statusCode === 410 || err.statusCode === 404) {
      console.warn("[WebPush] Subscription is gone (410/404), should be deleted");
      return { success: false, shouldDelete: true };
    }

    return { success: false, shouldDelete: false };
  }
}
