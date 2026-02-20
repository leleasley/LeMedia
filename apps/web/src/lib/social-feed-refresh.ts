export const SOCIAL_FEED_REFRESH_EVENT = "lemedia:social-feed-refresh";

export function triggerSocialFeedRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SOCIAL_FEED_REFRESH_EVENT));
}
