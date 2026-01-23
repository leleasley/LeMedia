/**
 * iOS-style haptic feedback utility
 * Uses the Vibration API to provide tactile feedback on supported devices
 */

type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error';

const hapticPatterns: Record<HapticStyle, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 30,
  selection: 8,
  success: [10, 50, 10],
  warning: [20, 50, 20],
  error: [30, 50, 30, 50, 30],
};

/**
 * Trigger haptic feedback
 * @param style - The style of haptic feedback to trigger
 * @returns true if vibration was triggered, false if not supported
 */
export function haptic(style: HapticStyle = 'light'): boolean {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) {
    return false;
  }

  try {
    const pattern = hapticPatterns[style];
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/**
 * React hook for haptic feedback
 * Returns a function that can be called to trigger haptic feedback
 */
export function useHaptic() {
  return {
    light: () => haptic('light'),
    medium: () => haptic('medium'),
    heavy: () => haptic('heavy'),
    selection: () => haptic('selection'),
    success: () => haptic('success'),
    warning: () => haptic('warning'),
    error: () => haptic('error'),
    trigger: haptic,
  };
}

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}
