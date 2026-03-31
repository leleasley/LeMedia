const CHANNEL_PREFIX = "lemedia-live-sync";

function getChannelName(key: string) {
  return `${CHANNEL_PREFIX}:${key}`;
}

export function publishLiveSync(key: string, payload?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const message = { key, at: Date.now(), payload: payload ?? null };
  try {
    window.localStorage.setItem(getChannelName(key), JSON.stringify(message));
  } catch {}
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(getChannelName(key));
    channel.postMessage(message);
    channel.close();
  }
}

export function subscribeLiveSync(key: string, callback: () => void) {
  if (typeof window === "undefined") return () => {};

  const storageHandler = (event: StorageEvent) => {
    if (event.key === getChannelName(key) && event.newValue) {
      callback();
    }
  };
  window.addEventListener("storage", storageHandler);

  let channel: BroadcastChannel | null = null;
  let messageHandler: ((event: MessageEvent) => void) | null = null;
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(getChannelName(key));
    messageHandler = () => callback();
    channel.addEventListener("message", messageHandler);
  }

  return () => {
    window.removeEventListener("storage", storageHandler);
    if (channel && messageHandler) {
      channel.removeEventListener("message", messageHandler);
      channel.close();
    }
  };
}
