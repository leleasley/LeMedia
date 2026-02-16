"use client";

const REQUESTS_CHANGED_EVENT = "lemedia:requests-changed";
const REQUESTS_CHANGED_STORAGE_KEY = "lemedia:requests-changed";
const REQUESTS_CHANGED_CHANNEL = "lemedia-requests";

export function emitRequestsChanged() {
  if (typeof window === "undefined") return;

  window.dispatchEvent(new CustomEvent(REQUESTS_CHANGED_EVENT));

  try {
    localStorage.setItem(REQUESTS_CHANGED_STORAGE_KEY, String(Date.now()));
  } catch {
    // ignore storage errors
  }

  try {
    if ("BroadcastChannel" in window) {
      const channel = new BroadcastChannel(REQUESTS_CHANGED_CHANNEL);
      channel.postMessage({ ts: Date.now() });
      channel.close();
    }
  } catch {
    // ignore channel errors
  }
}

export function subscribeRequestsChanged(onChange: () => void) {
  if (typeof window === "undefined") return () => undefined;

  const onEvent = () => onChange();
  const onStorage = (event: StorageEvent) => {
    if (event.key === REQUESTS_CHANGED_STORAGE_KEY) onChange();
  };

  window.addEventListener(REQUESTS_CHANGED_EVENT, onEvent);
  window.addEventListener("storage", onStorage);

  let channel: BroadcastChannel | null = null;
  if ("BroadcastChannel" in window) {
    try {
      channel = new BroadcastChannel(REQUESTS_CHANGED_CHANNEL);
      channel.onmessage = () => onChange();
    } catch {
      channel = null;
    }
  }

  return () => {
    window.removeEventListener(REQUESTS_CHANGED_EVENT, onEvent);
    window.removeEventListener("storage", onStorage);
    if (channel) channel.close();
  };
}

