// Cookie consent management utility
// Handles storing and checking user's cookie consent preference

export type CookieConsent = "accepted" | "declined" | null;

const CONSENT_COOKIE_NAME = "lemedia_consent";
const CONSENT_COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year
const CONSENT_CHANGED_EVENT = "lemedia:consent-changed";

function emitConsentChanged(consent: CookieConsent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(CONSENT_CHANGED_EVENT, {
      detail: { consent }
    })
  );
}

export function subscribeCookieConsent(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleConsentChanged = () => {
    onStoreChange();
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === CONSENT_COOKIE_NAME) {
      onStoreChange();
    }
  };

  window.addEventListener(CONSENT_CHANGED_EVENT, handleConsentChanged);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CONSENT_CHANGED_EVENT, handleConsentChanged);
    window.removeEventListener("storage", handleStorage);
  };
}

/**
 * Gets the current cookie consent status from localStorage
 * @returns "accepted", "declined", or null if no preference set
 */
export function getCookieConsent(): CookieConsent {
  if (typeof window === "undefined") return null;
  
  try {
    // Try to get from localStorage first
    const stored = localStorage.getItem(CONSENT_COOKIE_NAME);
    if (stored === "accepted" || stored === "declined") {
      return stored;
    }
  } catch {
    // localStorage might be disabled or in private mode
  }
  
  return null;
}

/**
 * Sets the cookie consent preference
 * @param consent "accepted" or "declined"
 */
export function setCookieConsent(consent: "accepted" | "declined"): void {
  if (typeof window === "undefined") return;
  
  try {
    // Store in localStorage
    localStorage.setItem(CONSENT_COOKIE_NAME, consent);
  } catch {
    // localStorage might be disabled
  }
  
  // Also set as a cookie for server-side awareness
  if (typeof document !== "undefined") {
    const maxAge = CONSENT_COOKIE_MAX_AGE;
    const expires = new Date();
    expires.setTime(expires.getTime() + maxAge * 1000);
    document.cookie = `${CONSENT_COOKIE_NAME}=${consent}; path=/; max-age=${maxAge}; SameSite=Lax`;
  }
  
  emitConsentChanged(consent);
}

/**
 * Clears the cookie consent preference
 */
export function clearCookieConsent(): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.removeItem(CONSENT_COOKIE_NAME);
  } catch {
    // localStorage might be disabled
  }
  
  if (typeof document !== "undefined") {
    document.cookie = `${CONSENT_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  }

  emitConsentChanged(null);
}

/**
 * Checks if user has accepted cookies
 */
export function hasCookieConsent(): boolean {
  return getCookieConsent() === "accepted";
}

/**
 * Only sets non-essential cookies if user has accepted them
 * This is a utility for components to check before setting cookies
 */
export function canSetNonEssentialCookies(): boolean {
  return hasCookieConsent();
}
