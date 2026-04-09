import { redirect } from "next/navigation";
import { getUser } from "@/auth";
import { getImageProxyEnabled } from "@/lib/app-settings";
import { ReviewQueuePageClient } from "@/components/Reviews/ReviewQueuePageClient";

export const metadata = {
  title: "Review Queue - LeMedia",
};

export default async function ReviewQueuePage() {
  const user = await getUser().catch(() => null);
  if (!user) {
    redirect("/login");
  }

  const imageProxyEnabled = await getImageProxyEnabled();

  return <ReviewQueuePageClient imageProxyEnabled={imageProxyEnabled} />;
}