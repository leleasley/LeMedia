"use client";

import Link, { LinkProps } from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type PrefetchLinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & LinkProps;

export function PrefetchLink({ href, onMouseEnter, onFocus, prefetch, ...props }: PrefetchLinkProps) {
  const router = useRouter();
  const [allowPrefetch, setAllowPrefetch] = useState(() => {
    if (prefetch === false || typeof window === "undefined") {
      return false;
    }
    const isMobile =
      window.matchMedia("(max-width: 768px)").matches ||
      window.matchMedia("(pointer: coarse)").matches ||
      window.matchMedia("(hover: none)").matches;
    return !isMobile;
  });

  const doPrefetch = useCallback(() => {
    if (!allowPrefetch) return;
    if (typeof href === "string") {
      router.prefetch(href);
      return;
    }
    if (href && "pathname" in href && href.pathname) {
      router.prefetch(href.pathname);
    }
  }, [allowPrefetch, href, router]);

  return (
    <Link
      href={href}
      prefetch={allowPrefetch}
      onMouseEnter={(e) => {
        doPrefetch();
        onMouseEnter?.(e);
      }}
      onFocus={(e) => {
        doPrefetch();
        onFocus?.(e);
      }}
      {...props}
    />
  );
}
