"use client";

import { useState, useEffect, useRef } from "react";
import { logger } from "@/lib/logger";

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: any) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({ onSuccess, onError, onExpire }: TurnstileWidgetProps) {
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !siteKey || !containerRef.current) {
      return;
    }

    const renderWidget = () => {
      if (!window.turnstile || !containerRef.current || widgetIdRef.current) {
        return;
      }

      try {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "auto",
          size: "normal",
          callback: (token: string) => {
            onSuccess(token);
          },
          "error-callback": () => {
            onError?.();
          },
          "expired-callback": () => {
            onExpire?.();
          },
        });
      } catch (error) {
        logger.error("[TurnstileWidget] Failed to render", error);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      let attempts = 0;
      const checkInterval = setInterval(() => {
        attempts++;
        if (window.turnstile) {
          clearInterval(checkInterval);
          renderWidget();
        } else if (attempts > 50) {
          clearInterval(checkInterval);
        }
      }, 100);

      return () => {
        clearInterval(checkInterval);
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
        }
      };
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
      }
    };
  }, [mounted, siteKey, onSuccess, onError, onExpire]);

  if (!mounted || !siteKey) {
    return null;
  }

  return (
    <div className="flex justify-center w-full overflow-x-auto">
      <div ref={containerRef} className="min-w-[300px]" />
    </div>
  );
}
