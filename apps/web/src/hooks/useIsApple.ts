import { useState, useEffect } from 'react';

/**
 * Detect if the current device is an Apple device (iOS, iPadOS, macOS)
 * This is used to conditionally render native iOS UI elements like selects
 */
export function useIsApple(): boolean | null {
  const [isApple, setIsApple] = useState<boolean | null>(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        setIsApple(false);
        return;
      }

      const userAgent = navigator.userAgent || navigator.vendor || '';
      const platform = navigator.platform || '';

      // Check for iOS devices (iPhone, iPad, iPod)
      const isIOS = /iPad|iPhone|iPod/.test(userAgent) ||
        // iPad on iOS 13+ reports as MacIntel but has touch
        (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      // Check for macOS (for consistency, though native selects work well there too)
      const isMacOS = /Mac/.test(platform) && !isIOS;

      setIsApple(isIOS || isMacOS);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  return isApple;
}

/**
 * Detect specifically if on iOS (iPhone, iPad, iPod)
 * More strict check for when we only want iOS-specific behavior
 */
export function useIsIOS(): boolean | null {
  const [isIOS, setIsIOS] = useState<boolean | null>(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        setIsIOS(false);
        return;
      }

      const userAgent = navigator.userAgent || navigator.vendor || '';
      const platform = navigator.platform || '';

      // Check for iOS devices (iPhone, iPad, iPod)
      const iOS = /iPad|iPhone|iPod/.test(userAgent) ||
        // iPad on iOS 13+ reports as MacIntel but has touch
        (platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      setIsIOS(iOS);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  return isIOS;
}

/**
 * Check if device is a touch device (includes iOS, Android, etc.)
 */
export function useIsTouchDevice(): boolean | null {
  const [isTouch, setIsTouch] = useState<boolean | null>(null);

  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      if (typeof window === 'undefined') {
        setIsTouch(false);
        return;
      }

      const hasTouch = 'ontouchstart' in window ||
        navigator.maxTouchPoints > 0;

      setIsTouch(hasTouch);
    });
    return () => window.cancelAnimationFrame(id);
  }, []);

  return isTouch;
}
