"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

type BackdropRotatorProps = {
  images: string[];
  intervalMs?: number;
};

export default function BackdropRotator({ images, intervalMs = 10000 }: BackdropRotatorProps) {
  const uniqueImages = useMemo(() => Array.from(new Set(images.filter(Boolean))), [images]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || uniqueImages.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % uniqueImages.length);
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [mounted, intervalMs, uniqueImages.length]);

  if (uniqueImages.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      {uniqueImages.map((src, index) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          sizes="100vw"
          priority={index === 0}
          unoptimized
          className="object-cover"
          style={{
            opacity: index === activeIndex ? 0.5 : 0,
            transition: "opacity 2s ease-in-out",
          }}
        />
      ))}
    </div>
  );
}
