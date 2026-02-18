import type { Metadata } from "next";
import { NotificationsPageClient } from "@/components/Social/Notifications/NotificationsPageClient";

export const metadata: Metadata = {
  title: "Notifications - LeMedia",
};

export default function NotificationsPage() {
  return <NotificationsPageClient />;
}
