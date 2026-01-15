"use client";

import { ServiceWorkerRegistration } from "./ServiceWorkerRegistration";
import { InstallPrompt } from "./InstallPrompt";

export function PWAProvider() {
  return (
    <>
      <ServiceWorkerRegistration />
      <InstallPrompt />
    </>
  );
}
