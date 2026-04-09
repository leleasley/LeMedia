"use client";

import { useEffect } from "react";

export function DiscoverBackgroundOverride() {
  useEffect(() => {
    // Add a class to the body that overrides the background
    document.body.classList.add("discover-bg-override");
    // Also target the html element to prevent #0f172a bleed-through
    document.documentElement.classList.add("discover-bg-override");
    
    return () => {
      document.body.classList.remove("discover-bg-override");
      document.documentElement.classList.remove("discover-bg-override");
    };
  }, []);

  return null;
}
