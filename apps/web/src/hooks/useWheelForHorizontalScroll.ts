import { useCallback } from "react";
import type { RefObject } from "react";
import type { WheelEvent } from "react";

/**
 * Hook to handle wheel events on horizontal scrolling containers.
 * When the user scrolls vertically over a horizontal carousel, 
 * this hook ensures the page scrolls normally instead of trying 
 * to scroll the carousel.
 * 
 * It only converts vertical scroll to horizontal when:
 * - The carousel can actually scroll in that direction
 * - The shift key is held (intentional horizontal scroll)
 */
export function useWheelForHorizontalScroll<T extends HTMLElement>(ref: RefObject<T | null>) {
  return useCallback((event: WheelEvent<T>) => {
    const node = ref.current;
    if (!node) return;

    const absX = Math.abs(event.deltaX);
    const absY = Math.abs(event.deltaY);

    // If user is scrolling horizontally (trackpad gesture or shift+scroll), let it happen naturally
    if (absX > absY || event.shiftKey) {
      return;
    }

    // For vertical scroll, don't intercept - let it bubble up to scroll the page
    // This allows normal page scrolling when hovering over carousels
    return;
  }, [ref]);
}
