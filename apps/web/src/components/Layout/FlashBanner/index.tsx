"use client";

import { useEffect, useRef } from "react";
import { csrfFetch } from "@/lib/csrf-client";
import { useToast } from "@/components/Providers/ToastProvider";
import { sendUserNotification } from "@/lib/notification-helper";

export function FlashBanner({ message, type = "success", timeoutMs = 4000 }: { message: string; type?: "success" | "error" | "info"; timeoutMs?: number }) {
    const toast = useToast();
    const didShow = useRef(false);

    useEffect(() => {
        if (didShow.current || !message) return;
        didShow.current = true;
        
        // Show toast based on type
        if (type === "error") {
            toast.error(message, { timeoutMs });
        } else if (type === "info") {
            toast.info(message, { timeoutMs });
        } else {
            toast.success(message, { timeoutMs });
        }

        // Clear server side
        const t = setTimeout(() => {
            try {
                csrfFetch("/api/v1/flash/clear", { method: "POST", credentials: "include" }).catch(() => { });
            } catch { }
        }, 100);
        return () => clearTimeout(t);
    }, [message, type, timeoutMs, toast]);

    return null;
}
