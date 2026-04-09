"use client";

import { useEffect } from "react";

export function ProfileBackgroundOverride() {
  useEffect(() => {
    document.body.classList.add("profile-bg-override");
    document.documentElement.classList.add("profile-bg-override");

    return () => {
      document.body.classList.remove("profile-bg-override");
      document.documentElement.classList.remove("profile-bg-override");
    };
  }, []);

  return null;
}