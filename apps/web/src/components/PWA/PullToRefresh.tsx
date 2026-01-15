"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [startY, setStartY] = useState(0);

  useEffect(() => {
    let touchStartY = 0;
    let touchMoveY = 0;
    let isRefreshing = false;

    const handleTouchStart = (e: TouchEvent) => {
      // Check window.scrollY for global scroll position
      if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY;
        setStartY(touchStartY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (touchStartY === 0 || isRefreshing) return;

      touchMoveY = e.touches[0].clientY;
      const distance = touchMoveY - touchStartY;

      if (distance > 0 && distance < 150) {
        setIsPulling(true);
        setPullDistance(distance);
        e.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance > 80 && !isRefreshing) {
        isRefreshing = true;
        setIsPulling(true);
        
        try {
          router.refresh();
          await new Promise(resolve => setTimeout(resolve, 500));
        } finally {
          isRefreshing = false;
          setIsPulling(false);
          setPullDistance(0);
          touchStartY = 0;
          setStartY(0);
        }
      } else {
        setIsPulling(false);
        setPullDistance(0);
        touchStartY = 0;
        setStartY(0);
      }
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [router, pullDistance]);

  return (
    <>
      {isPulling && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center bg-gradient-to-b from-blue-600/20 to-transparent transition-all duration-300 pt-14"
          style={{
            height: `${Math.min(pullDistance, 120)}px`,
            opacity: Math.min(pullDistance / 80, 1)
          }}
        >
          <div className="text-white flex items-center gap-2">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="text-sm font-medium">
              {pullDistance > 80 ? "Release to refresh" : "Pull to refresh"}
            </span>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
