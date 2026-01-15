import { debounce } from "lodash";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const IS_SCROLLING_CHECK_THROTTLE = 200;
const BUFFER_HEIGHT = 200;

/**
 * useVerticalScroll is a custom hook to handle infinite scrolling
 *
 * @param callback Callback is executed when page reaches bottom
 * @param shouldFetch Disables callback if true
 */
const useVerticalScroll = (
  callback: () => void,
  shouldFetch: boolean,
  options?: { triggerOnMount?: boolean }
): boolean => {
  const { triggerOnMount = true } = options ?? {};
  const [isScrolling, setScrolling] = useState(false);

  type SetTimeoutReturnType = ReturnType<typeof setTimeout>;
  const scrollingTimer: MutableRefObject<SetTimeoutReturnType | undefined> =
    useRef<SetTimeoutReturnType | undefined>(undefined);

  const runCallback = useCallback(() => {
    if (shouldFetch) {
      const main = document.querySelector("main");
      // Check if main is visible and scrollable (Desktop layout)
      if (main && main.offsetParent !== null) {
        const { scrollTop, scrollHeight, clientHeight } = main;
        if (scrollTop + clientHeight >= scrollHeight - BUFFER_HEIGHT) {
          callback();
        }
      } else {
        // Fallback to window/document (Mobile layout)
        const scrollTop = Math.max(
          window.pageYOffset,
          document.documentElement.scrollTop,
          document.body.scrollTop
        );
        if (
          window.innerHeight + scrollTop >=
          document.documentElement.offsetHeight - BUFFER_HEIGHT
        ) {
          callback();
        }
      }
    }
  }, [callback, shouldFetch]);

  const debouncedCallback = useMemo(
    () => debounce(runCallback, 50),
    [runCallback]
  );

  // Run callback on mount and when dependencies change
  useEffect(() => {
    if (!triggerOnMount) return;
    runCallback();
  }, [runCallback, triggerOnMount]);

  // Setup scroll and resize listeners
  useEffect(() => {
    const onScroll = () => {
      if (scrollingTimer.current !== undefined) {
        clearTimeout(scrollingTimer.current);
      }
      if (!isScrolling) {
        setScrolling(true);
      }

      scrollingTimer.current = setTimeout(() => {
        setScrolling(false);
      }, IS_SCROLLING_CHECK_THROTTLE);
      debouncedCallback();
    };

    const onResize = () => {
      debouncedCallback();
    };

    const main = document.querySelector("main");
    
    // Attach to both window and main to handle responsive layout changes
    window.addEventListener("scroll", onScroll, { passive: true });
    if (main) {
        main.addEventListener("scroll", onScroll, { passive: true });
    }
    window.addEventListener("resize", onResize, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (main) {
          main.removeEventListener("scroll", onScroll);
      }
      window.removeEventListener("resize", onResize);

      if (scrollingTimer.current !== undefined) {
        clearTimeout(scrollingTimer.current);
      }
      debouncedCallback.cancel();
    };
  }, [debouncedCallback, isScrolling]);

  return isScrolling;
};

export default useVerticalScroll;
