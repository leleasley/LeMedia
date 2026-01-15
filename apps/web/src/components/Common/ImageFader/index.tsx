"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface ImageFaderProps {
  backgroundImages: string[];
  rotationSpeed?: number;
  isDarker?: boolean;
  className?: string;
}

const DEFAULT_ROTATION_SPEED = 6000;

export function ImageFader({
  backgroundImages,
  rotationSpeed = DEFAULT_ROTATION_SPEED,
  isDarker = false,
  className = "",
}: ImageFaderProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (backgroundImages.length === 0) return;
    
    const interval = setInterval(
      () => setActiveIndex((ai) => (ai + 1) % backgroundImages.length),
      rotationSpeed
    );

    return () => {
      clearInterval(interval);
    };
  }, [backgroundImages, rotationSpeed]);

  // Match Jellyseerr's exact gradient styling
  const gradient = isDarker
    ? "linear-gradient(180deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 100%)"
    : "linear-gradient(180deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 100%)";

  if (backgroundImages.length === 0) return null;

  return (
    <div className={className}>
      {backgroundImages.map((imageUrl, i) => (
        <div
          key={`banner-image-${i}`}
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-300 ease-in ${
            i === activeIndex ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            className="absolute inset-0 h-full w-full object-cover"
            alt=""
            src={imageUrl}
            fill
            unoptimized
            priority={i === 0}
          />
          <div
            className="absolute inset-0"
            style={{ backgroundImage: gradient }}
          />
        </div>
      ))}
    </div>
  );
}
